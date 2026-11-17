// Checks for the Settings page, the dialog, and the sync / export / reset flows.
//   NODE_PATH=/opt/node-tools/node_modules node check-settings.js [--mobile] [--only=name]
// Sync runs against a stand-in server: one blob per token in this process, shared by every "device" a check opens.
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const mobile = process.argv.includes('--mobile');
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const RICH = JSON.parse(fs.readFileSync(path.join(S, 'harness/scratch/seed-rich.json'), 'utf8'));
const PROGRESS = ['atlas-records', 'atlas-focus', 'atlas-pin', 'atlas-learn', 'atlas-daily-attempts', 'atlas-mastery'];
let fails = 0, passes = 0;
const ok = (cond, what) => { if (cond) passes++; else { fails++; console.log('  FAIL: ' + what); } };
const eq = (a, b, what) => ok(JSON.stringify(a) === JSON.stringify(b), what + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

function server() {
  return { kv: {}, posts: [], gets: 0, postStatus: 200, getStatus: 200, offline: false };
}

// A device: its own browser, storage seeded once (not on every load), the given view open
async function device(srv, seed, tail, launchOpts) {
  const h = await launch(Object.assign(mobile ? { mobile: true } : { width: 1280, height: 800 }, launchOpts || {}));
  h.dialogs = [];
  h.page.on('dialog', d => { h.dialogs.push(d.type() + ': ' + d.message()); d.dismiss().catch(() => {}); });
  await h.page.route('**/api/records*', async route => {
    const req = route.request();
    const token = new URL(req.url()).searchParams.get('token');
    if (srv.offline) return route.abort();
    if (req.method() === 'POST') {
      if (srv.postStatus !== 200) return route.fulfill({ status: srv.postStatus, contentType: 'application/json', body: '{"error":"x"}' });
      srv.kv[token] = req.postData();
      srv.posts.push(req.postData());
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    }
    srv.gets++;
    if (srv.getStatus !== 200) return route.fulfill({ status: srv.getStatus, contentType: 'application/json', body: '{"error":"x"}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: srv.kv[token] || 'null' });
  });
  await h.page.goto(h.url);
  await h.page.evaluate(seedIn => { Object.keys(seedIn).forEach(k => localStorage.setItem(k, seedIn[k])); }, seed || {});
  await h.page.goto(h.url + (tail || '#settings'));
  await h.page.reload();
  await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0, null, { timeout: 30000 });
  await h.page.waitForTimeout(400);
  return h;
}
const click = (page, sel) => page.locator(sel).first().click();
const text = (page, sel) => page.evaluate(q => { const el = document.querySelector(q); return el ? el.textContent : null; }, sel);
const ls = (page, key) => page.evaluate(k => localStorage.getItem(k), key);
const notice = page => page.evaluate(() => { const n = document.getElementById('app-notice'); return n && n.classList.contains('show') ? n.textContent : ''; });
const dialogOpen = page => page.evaluate(() => !document.getElementById('dialog').hidden);
const waitFor = async (fn, ms) => { for (let i = 0; i < (ms || 5000) / 50; i++) { if (await fn()) return true; await new Promise(r => setTimeout(r, 50)); } return false; };

const checks = {
  async 'appearance and play'() {
    const srv = server();
    const h = await device(srv, {});
    const page = h.page;
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'no-preference' });
    const tiles = () => page.evaluate(() => Array.from(document.querySelectorAll('.theme-tile')).map(t => t.dataset.value + ':' + t.getAttribute('aria-checked') + ':' + t.tabIndex).join(' '));
    eq(await tiles(), 'system:true:0 light:false:-1 dark:false:-1', 'System is the choice until one is made');
    await click(page, '.theme-tile[data-value="dark"]');
    eq([await page.evaluate(() => document.documentElement.dataset.theme), await ls(page, 'atlas-theme'), await page.evaluate(() => document.querySelector('meta[name=theme-color]').content)],
      ['dark', 'dark', '#101824'], 'Night Chart applies, is stored, and colours the browser chrome');
    eq(await tiles(), 'system:false:-1 light:false:-1 dark:true:0', 'the tile is marked');
    await page.keyboard.press('ArrowLeft');
    eq([await page.evaluate(() => document.documentElement.dataset.theme), await page.evaluate(() => document.activeElement.dataset.value)], ['light', 'light'], 'arrow keys move through the tiles and pick');
    await click(page, '.theme-tile[data-value="system"]');
    eq(await page.evaluate(() => document.documentElement.dataset.theme), 'light', 'System follows a light device');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForTimeout(150);
    eq(await page.evaluate(() => document.documentElement.dataset.theme), 'dark', 'and turns with the device');
    await click(page, '#theme-toggle');
    eq([await ls(page, 'atlas-theme'), await tiles()], ['light', 'system:false:-1 light:true:0 dark:false:-1'], 'the top-bar toggle and the tiles stay in step');
    await page.emulateMedia({ colorScheme: 'light' });

    // Reduce motion
    const motion = () => page.evaluate(() => [document.querySelector('[data-action="toggle-motion"]').getAttribute('aria-checked'), document.documentElement.getAttribute('data-motion'), localStorage.getItem('atlas-motion')]);
    eq(await motion(), ['false', null, null], 'motion: off and unset on a device that has not asked for less');
    await click(page, '[data-action="toggle-motion"]');
    eq(await motion(), ['true', 'reduce', 'reduce'], 'switching it on reduces motion and stores the choice');
    await click(page, '[data-action="toggle-motion"]');
    eq(await motion(), ['false', 'full', 'full'], 'switching it off stores "full"');
    await page.evaluate(() => { localStorage.removeItem('atlas-motion'); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0 && document.querySelector('[data-action="toggle-motion"]'));
    eq(await motion(), ['true', null, null], 'with nothing stored the switch shows the device setting');
    await page.focus('[data-action="toggle-motion"]');
    await page.keyboard.press('Space');
    eq(await motion(), ['false', 'full', 'full'], 'the keyboard works the switch, overriding the device');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Difficulty and map style are the same settings as on Home
    await click(page, '#settings-content [data-action="set-difficulty"][data-value="hard"]');
    await page.evaluate(() => window.__atlas.showView('home'));
    eq([await page.evaluate(() => window.__atlas.state.difficulty), await ls(page, 'atlas-difficulty'),
      await page.evaluate(() => document.querySelector('#menu-screen [data-action="set-difficulty"][data-value="hard"]').getAttribute('aria-checked'))],
      ['hard', 'hard', 'true'], 'difficulty set here is the app’s difficulty, and Home shows it');
    await page.evaluate(() => window.__atlas.showView('settings'));
    eq(await page.evaluate(() => document.querySelector('#settings-content [data-action="set-difficulty"][data-value="hard"]').getAttribute('aria-checked')), 'true', 'Settings still shows it on return');
    await click(page, '#settings-content [data-action="set-map"][data-value="satellite"]');
    eq([await page.evaluate(() => window.__atlas.state.mapStyle), await ls(page, 'atlas-map-style')], ['satellite', 'satellite'], 'map style likewise');
    await click(page, '#settings-content [data-action="set-difficulty"][data-value="uncharted"]');
    eq(await page.evaluate(() => [document.querySelector('#settings-content [data-action="set-map"][data-value="parchment"]').disabled, document.querySelector('#settings-content [data-map-note]').hidden]),
      [true, false], 'Uncharted locks the map to satellite and says so');
    eq(await page.evaluate(() => document.querySelectorAll('[title]').length), 0, 'no title= attributes');
    ok(await page.evaluate(() => { const v = document.getElementById('settings-screen'); return v.scrollWidth <= v.clientWidth; }), 'no sideways scroll');
    ok(await page.evaluate(() => !document.getElementById('sync-modal-overlay') && !document.querySelector('#menu-screen [data-action*="sync"]')), 'the old sync modal and Home’s sync entry are gone');
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  async 'sync: create, code, username, errors, unlink'() {
    const srv = server();
    const h = await device(srv, RICH);
    const page = h.page;
    ok(await page.evaluate(() => !!document.querySelector('.sync-setup') && document.querySelector('[data-sync-dot]').hidden), 'not set up: the way in, and no sync light');
    await click(page, '[data-action="sync-create"]');
    ok(await dialogOpen(page), 'Create opens the dialog');
    eq(await page.evaluate(() => document.activeElement.id), 'sync-username-new', 'focus starts in the username field');
    // Tab stays inside the dialog
    const stops = [];
    for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); stops.push(await page.evaluate(() => !!document.activeElement.closest('#dialog'))); }
    ok(stops.every(Boolean), 'Tab stays inside the dialog');
    await page.keyboard.press('Escape');
    ok(!(await dialogOpen(page)) && await page.evaluate(() => document.activeElement.dataset.action === 'sync-create'), 'Escape closes it and focus returns to the button');
    eq(await ls(page, 'atlas-sync-token'), null, 'closing creates nothing');

    await click(page, '[data-action="sync-create"]');
    await page.fill('#sync-username-new', 'harbor-finch');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => !!document.getElementById('sync-code-full'), null, { timeout: 8000 });
    const token = await ls(page, 'atlas-sync-token');
    ok(/^[a-f0-9]{32}$/.test(token || ''), 'Enter in the field creates a 32-hex code');
    eq((await text(page, '#sync-code-full')).replace(/\s/g, ''), token, 'the dialog shows the code in full');
    eq(await text(page, '#dialog-title'), 'Your sync code is ready', 'and says it is ready');
    eq(srv.posts.length, 1, 'the first push went out');
    const sent = JSON.parse(srv.posts[0]);
    ok(sent.username === 'harbor-finch' && sent.version === 2 && Object.keys(sent.records).length === Object.keys(JSON.parse(RICH['atlas-records'])).length && !!sent.mastery, 'with the username and this device’s progress');
    await click(page, '#dialog [data-action="dialog-close"].btn');
    eq(await page.evaluate(() => document.activeElement.id), 'sync-now-btn', 'closing lands the focus on Sync now (the set-up card is gone)');
    eq(await text(page, '#sync-title'), 'Syncing as harbor-finch', 'the card says who it syncs as');
    ok(/Up to date · last synced just now/.test(await text(page, '#sync-status-line')), 'status: ' + await text(page, '#sync-status-line'));
    ok(await page.evaluate(() => { const d = document.querySelector('.topnav [data-sync-dot], .tabbar [data-sync-dot]'); return !d.hidden && !d.classList.contains('is-error'); }), 'the navigation shows the sync light');

    // The code: masked, shown, copied
    const masked = await text(page, '#sync-key-display');
    ok(masked.replace(/•/g, '').trim() === token.slice(-4) && masked.indexOf(token.slice(0, 4)) === -1, 'the code is masked to its last four: ' + masked);
    await click(page, '[data-action="sync-toggle-code"]');
    eq([(await text(page, '#sync-key-display')).replace(/\s/g, ''), await text(page, '#sync-key-show'), await page.getAttribute('#sync-key-show', 'aria-pressed')], [token, 'Hide', 'true'], 'Show reveals it');
    await click(page, '[data-action="sync-toggle-code"]');
    ok((await text(page, '#sync-key-display')).indexOf(token.slice(0, 4)) === -1, 'Hide masks it again');
    await h.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await click(page, '#sync-key-copy');
    await page.waitForTimeout(200);
    eq([await page.evaluate(() => navigator.clipboard.readText()), await notice(page)], [token, 'Sync code copied.'], 'Copy puts the code on the clipboard and says so');
    // Where the clipboard is refused, the code is laid out to copy by hand
    await page.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('denied')); });
    await click(page, '#sync-key-copy');
    await page.waitForFunction(() => !!document.querySelector('#dialog textarea'));
    eq([await page.evaluate(() => document.querySelector('#dialog textarea').value), await text(page, '#dialog-title'), await page.evaluate(() => document.activeElement.tagName)],
      [token, 'Copy your sync code', 'TEXTAREA'], 'copy fallback dialog holds the code, selected');
    await page.keyboard.press('Escape');
    eq(h.dialogs.length, 0, 'no native dialogs: ' + h.dialogs.join(' | '));

    // Another device
    await click(page, '[data-action="sync-add-device"]');
    eq([(await text(page, '#sync-code-full')).replace(/\s/g, ''), await text(page, '#dialog-title'), await page.evaluate(() => document.querySelectorAll('.steps-list li').length)], [token, 'Link another device', 3], 'Link a device shows the steps and the code');
    await page.keyboard.press('Escape');

    // Username: saves itself, keeps the field's focus through the push
    await page.fill('#sync-username-edit', 'tern');
    eq(await text(page, '#sync-title'), 'Syncing as tern', 'the title follows the typing');
    ok(await waitFor(() => srv.posts.length >= 2 && JSON.parse(srv.posts[srv.posts.length - 1]).username === 'tern', 4000), 'the new username is pushed');
    await page.waitForTimeout(200);
    eq([await page.evaluate(() => document.activeElement.id), await ls(page, 'atlas-sync-username')], ['sync-username-edit', 'tern'], 'and the field still has the focus');

    // Sync now, and each way it can fail
    const syncNow = async () => {
      await click(page, '#sync-now-btn');
      await page.waitForFunction(() => { const b = document.getElementById('sync-now-btn'); return b && !b.disabled && b.textContent === 'Sync now'; }, null, { timeout: 8000 });
      return page.evaluate(() => { const l = document.getElementById('sync-status-line'); const d = document.querySelector('[data-sync-dot]');
        return { text: l.textContent, error: l.classList.contains('is-error'), dot: d.classList.contains('is-error'), cloud: document.querySelector('.sync-avatar').classList.contains('is-error') }; });
    };
    let st = await syncNow();
    ok(/last synced just now/.test(st.text) && !st.error && !st.dot, 'Sync now: ' + JSON.stringify(st));
    srv.postStatus = 413;
    st = await syncNow();
    ok(/too large to sync/.test(st.text) && st.error && st.dot && st.cloud, 'a 413 is explained, in the card and on the navigation light: ' + JSON.stringify(st));
    await page.evaluate(() => window.__atlas.showView('home'));
    await page.evaluate(() => window.__atlas.showView('settings'));
    ok(/too large to sync/.test(await text(page, '#sync-status-line')), 'and is still explained after leaving and coming back');
    srv.postStatus = 200; srv.getStatus = 503;
    st = await syncNow();
    ok(/Couldn’t fetch your synced progress \(error 503\)/.test(st.text) && st.error, 'a failed pull: ' + st.text);
    srv.getStatus = 200; srv.offline = true;
    st = await syncNow();
    ok(/Couldn’t reach the sync server/.test(st.text) && st.error, 'offline: ' + st.text);
    srv.offline = false;
    st = await syncNow();
    ok(/Up to date/.test(st.text) && !st.error && !st.dot && !st.cloud, 'recovering clears the error: ' + JSON.stringify(st));

    // Unlink
    await click(page, '[data-action="sync-unlink"]');
    eq([await text(page, '#dialog-title'), await page.evaluate(() => document.activeElement.textContent)], ['Unlink this device?', 'Cancel'], 'Unlink asks first, focus on Cancel');
    await page.keyboard.press('Enter');
    ok(!(await dialogOpen(page)) && (await ls(page, 'atlas-sync-token')) === token, 'Cancel keeps the link');
    await click(page, '[data-action="sync-unlink"]');
    await click(page, '[data-action="dialog-confirm"]');
    eq([await ls(page, 'atlas-sync-token'), await ls(page, 'atlas-sync-username'), !!(await ls(page, 'atlas-records')), await page.evaluate(() => !!document.querySelector('.sync-setup')), await page.evaluate(() => document.querySelector('[data-sync-dot]').hidden)],
      [null, null, true, true, true], 'unlinking removes the code and nothing else');
    eq(await notice(page), 'This device no longer syncs.', 'and says so');
    eq(await page.evaluate(() => document.activeElement.dataset.action), 'sync-create', 'focus moves to the way back in');
    eq(h.errors.filter(e => !/Failed to load resource|net::ERR/.test(e)).length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  async 'sync: link a second device; a pull redraws Stats'() {
    const srv = server();
    const token = '4a8e9b2c7d3f1e6a5b8c2d4e7f9a1b3c';
    // Device A holds the progress and the code
    const a = await device(srv, Object.assign({ 'atlas-sync-token': token, 'atlas-sync-username': 'harbor-finch' }, RICH));
    await a.page.locator('#sync-now-btn').click();
    ok(await waitFor(() => !!srv.kv[token]), 'device A’s progress reaches the server');
    // Device B is new and links with the code
    const b = await device(srv, {});
    const pb = b.page;
    await click(pb, '[data-action="sync-link"]');
    await pb.fill('#sync-key-input', 'not-a-code');
    await click(pb, '#sync-import-btn');
    ok(/isn’t a sync code/.test(await text(pb, '#sync-import-status')) && (await ls(pb, 'atlas-sync-token')) === null && await dialogOpen(pb), 'a mistyped code is refused in the dialog');
    srv.getStatus = 500;
    await pb.fill('#sync-key-input', token);
    await click(pb, '#sync-import-btn');
    await pb.waitForFunction(() => /Nothing was linked/.test(document.getElementById('sync-import-status').textContent), null, { timeout: 8000 });
    eq([await ls(pb, 'atlas-sync-token'), await text(pb, '#sync-import-btn')], [null, 'Link device'], 'a failed link leaves the device unlinked and the form ready');
    srv.getStatus = 200;
    // Spaces and capitals in a typed code don't matter
    await pb.fill('#sync-key-input', token.toUpperCase().match(/.{4}/g).join(' '));
    await pb.keyboard.press('Enter');
    await pb.waitForFunction(() => document.getElementById('dialog').hidden, null, { timeout: 8000 });
    eq([await ls(pb, 'atlas-sync-token'), await ls(pb, 'atlas-records'), await text(pb, '#sync-title'), await notice(pb)],
      [token, await ls(a.page, 'atlas-records'), 'Syncing as harbor-finch', 'This device is linked. Your progress has been merged.'], 'device B is linked and holds A’s records');
    eq(await pb.evaluate(() => window.__atlas.mastery.totals().games), await a.page.evaluate(() => window.__atlas.mastery.totals().games), 'and A’s mastery history');
    eq(await pb.evaluate(() => document.activeElement.id), 'sync-now-btn', 'focus lands on Sync now after linking');

    // Device C opens Stats with the code but nothing local: the pull on load fills the page in
    const c = await device(srv, { 'atlas-sync-token': token }, '#stats');
    await c.page.waitForFunction(() => { const dd = document.querySelector('.kpi dd'); return dd && dd.textContent !== '—'; }, null, { timeout: 15000 });
    eq(await c.page.evaluate(() => document.querySelectorAll('.records tbody tr:not(.records-group)').length), Object.keys(JSON.parse(RICH['atlas-records'])).length, 'Stats redraws with the pulled records');
    eq(b.dialogs.concat(a.dialogs).length, 0, 'no native dialogs');
    await a.close(); await b.close(); await c.close();
  },

  async 'data: export, reset, and the reset reaching a second device'() {
    const srv = server();
    const token = 'aaaabbbbccccddddeeeeffff00001111';
    const seed = Object.assign({ 'atlas-sync-token': token, 'atlas-sync-username': 'tern' }, RICH);
    const a = await device(srv, seed, '#settings', { });
    const b = await device(srv, seed);
    const pa = a.page, pb = b.page;

    // Export
    const [download] = await Promise.all([pa.waitForEvent('download'), click(pa, '[data-action="export-progress"]')]);
    const file = path.join(S, 'harness/scratch', 'export-check.json');
    await download.saveAs(file);
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    ok(/^cartographers-atlas-progress-\d{4}-\d\d-\d\d\.json$/.test(download.suggestedFilename()), 'the file is named for the app and the day: ' + download.suggestedFilename());
    eq([data.app, data.exportVersion, Object.keys(data.records).length, Object.keys(data.dailyAttempts).length, data.pin.games.length, typeof data.mastery, Object.keys(data.focusLists).length > 0, Object.keys(data.learn).length],
      ['cartographers-atlas', 1, Object.keys(JSON.parse(RICH['atlas-records'])).length, Object.keys(JSON.parse(RICH['atlas-daily-attempts'])).length, JSON.parse(RICH['atlas-pin']).games.length, 'object', true, 2],
      'the export holds every store');
    ok(raw.indexOf(token) === -1, 'the sync code is not in the file');
    ok(/Saved as cartographers-atlas-progress/.test(await notice(pa)), 'a notice names the file');

    // Reset: the dialog says what goes, Cancel changes nothing
    await click(pa, '[data-action="reset-progress"]');
    const said = await pa.evaluate(() => ({ title: document.getElementById('dialog-title').textContent, items: Array.from(document.querySelectorAll('.dialog-list li')).map(li => li.textContent), body: document.querySelector('.dialog-text').textContent, focus: document.activeElement.textContent }));
    eq([said.title, said.items.length, said.focus], ['Reset all progress?', 6, 'Cancel'], 'the reset dialog');
    ok(['records', 'Mastery', 'streak', 'Daily Five', 'Pin the City', 'Focus'].every(w => said.items.join(' ').indexOf(w) !== -1), 'it lists every kind of progress: ' + said.items.join(' / '));
    ok(/other devices are reset too/.test(said.body), 'and warns that linked devices follow');
    await (mobile ? pa.touchscreen.tap(8, 8) : pa.mouse.click(8, 8));
    ok(!(await dialogOpen(pa)) && !!(await ls(pa, 'atlas-records')), 'the backdrop cancels; nothing is erased');
    eq(await pa.evaluate(() => document.activeElement.dataset.action), 'reset-progress', 'focus returns to the Reset button');

    const postsBefore = srv.posts.length;
    await click(pa, '[data-action="reset-progress"]');
    await click(pa, '[data-action="dialog-confirm"]');
    ok(await waitFor(() => srv.posts.length > postsBefore), 'the reset is pushed');
    const afterA = await pa.evaluate(keys => keys.map(k => localStorage.getItem(k)), PROGRESS);
    ok(afterA.slice(0, 5).every(v => v === null), 'every progress store is gone on this device: ' + afterA.map(v => v === null ? 'null' : v.length).join(','));
    eq(await pa.evaluate(() => { const t = window.__atlas.mastery.totals(); return [t.games, t.itemsSeen]; }), [0, 0], 'mastery is empty');
    eq([await ls(pa, 'atlas-sync-token'), await ls(pa, 'atlas-difficulty') !== 'x', Number(await ls(pa, 'atlas-reset-at')) > 0], [token, true, true], 'the sync code stays; the reset time is stamped');
    ok(await waitFor(async () => (await notice(pa)) === 'Progress reset.'), 'a notice confirms it');
    const blob = JSON.parse(srv.kv[token]);
    eq([Object.keys(blob.records).length, blob.resetAt > 0, blob.pin.games.length], [0, true, 0], 'the server now holds the reset');
    await pa.evaluate(() => window.__atlas.showView('stats'));
    eq(await pa.evaluate(() => Array.from(document.querySelectorAll('.kpi dd')).map(d => d.textContent).join('')), '—————', 'Stats on the reset device is a new player’s');

    // Device B still has everything, until it next syncs
    ok(!!(await ls(pb, 'atlas-records')) && (await pb.evaluate(() => window.__atlas.mastery.totals().games)) > 0, 'device B still holds its copy before syncing');
    await pb.locator('#sync-now-btn').click();
    await pb.waitForFunction(() => { const b2 = document.getElementById('sync-now-btn'); return b2 && !b2.disabled && /last synced/.test(document.getElementById('sync-status-line').textContent); }, null, { timeout: 8000 });
    const afterB = await pb.evaluate(keys => keys.map(k => localStorage.getItem(k)), PROGRESS);
    const emptyish = v => v === null || v === '{}' || /^\{"games":\[\],"cities":\{\}\}$/.test(v);
    ok(afterB.slice(0, 5).every(emptyish), 'the reset reached device B: ' + afterB.slice(0, 5).map(v => v === null ? 'null' : v.slice(0, 30)).join(' | '));
    eq(await pb.evaluate(() => { const t = window.__atlas.mastery.totals(); return [t.games, t.itemsSeen]; }), [0, 0], 'device B’s mastery is erased too');
    eq(await ls(pb, 'atlas-reset-at'), await ls(pa, 'atlas-reset-at'), 'and it adopts the reset time');
    eq(Object.keys(JSON.parse(srv.kv[token]).records).length, 0, 'device B’s old copy did not come back to the server');
    await pb.evaluate(() => window.__atlas.showView('home'));
    eq(await pb.evaluate(() => document.querySelector('.masthead h1').textContent), 'Welcome.', 'device B’s Home greets a new player');

    // Without sync the dialog says only settings stay
    await pb.evaluate(() => { localStorage.removeItem('atlas-sync-token'); window.__atlas.showView('settings'); });
    await click(pb, '[data-action="reset-progress"]');
    ok(!/other devices/.test(await text(pb, '.dialog-text')) && /Your settings stay as they are/.test(await text(pb, '.dialog-text')), 'unsynced: no mention of other devices');
    await pb.keyboard.press('Escape');
    eq(a.dialogs.concat(b.dialogs).length, 0, 'no native dialogs');
    eq(a.errors.concat(b.errors).length, 0, 'page errors: ' + a.errors.concat(b.errors).join(' | '));
    await a.close(); await b.close();
  },

  async 'about, share, and a map that fails to load'() {
    const srv = server();
    const h = await device(srv, {});
    const page = h.page;
    const about = await text(page, '.about');
    ok(['Natural Earth', 'Esri World Imagery', 'Cormorant Garamond', 'Inter'].every(w => about.indexOf(w) !== -1), 'About credits the borders, the imagery and the typefaces');
    // No share sheet here: the link is copied, or shown to copy
    await page.evaluate(() => { try { delete Navigator.prototype.share; } catch (e) {} navigator.share = undefined; });
    await h.context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await click(page, '[data-action="share-app"]');
    await page.waitForTimeout(250);
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    eq([copied, await notice(page)], [h.url, 'Link copied.'], 'Share copies the app’s address');

    // A province map that can't be fetched: back to Home with a notice, no browser alert
    await page.route('**/data/provinces-canada.json', route => route.abort());
    await page.evaluate(() => { window.__atlas.showView('home'); window.__atlas.startGame('canada-provinces'); });
    await page.waitForFunction(() => { const n = document.getElementById('app-notice'); return n && n.classList.contains('show') && /could not be loaded/.test(n.textContent); }, null, { timeout: 30000 });
    eq([await page.evaluate(() => document.body.dataset.screen), h.dialogs.length], ['menu', 0], 'a failed map load returns Home with a notice');
    await h.close();
  }
};

(async () => {
  for (const name of Object.keys(checks)) {
    if (only && name.indexOf(only) === -1) continue;
    const f0 = fails;
    try { await checks[name](); } catch (e) { fails++; console.log('  ERROR in ' + name + ': ' + (e.stack || e).split('\n').slice(0, 3).join(' ')); }
    console.log((fails === f0 ? 'PASS  ' : 'FAIL  ') + name);
  }
  console.log(passes + ' assertions passed, ' + fails + ' failed' + (mobile ? ' (mobile)' : ''));
  process.exit(fails ? 1 : 0);
})();
