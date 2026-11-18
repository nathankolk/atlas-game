// Navigation and robustness: views and the back button, hashes, level links, resize and rotation mid-round,
// a second tab on the same data, localStorage that throws.
'use strict';
const fs = require('fs');
const L = require('./lib.js');
const Pl = require('./play.js');
const part = (process.argv.find(a => a.startsWith('--part=')) || '--part=views,links,resize,tabs,storage').slice(7).split(',');
const out = [];
const say = s => { out.push(s); console.log(s); };
const where = page => page.evaluate(() => ({ screen: document.body.dataset.screen, view: window.__atlas ? window.__atlas.state.view : null, url: location.pathname + location.search + location.hash, hist: history.length, notice: ((document.getElementById('app-notice') || {}).textContent || '').trim() }));
const errsOf = sess => sess.errors.splice(0).filter(e => !/Failed to load resource/.test(e));
const PKEYS = ['atlas-records', 'atlas-focus', 'atlas-pin', 'atlas-learn', 'atlas-daily-attempts', 'atlas-mastery'];
const snapStores = page => page.evaluate(keys => keys.map(k => localStorage.getItem(k)).join('\u0001'), PKEYS);

(async () => {
  if (part.includes('views')) {
    const sess = await L.open(); const page = sess.page;
    await page.goto('about:blank');
    await L.home(sess); await L.waitMenu(page);
    say('VIEWS start ' + JSON.stringify(await where(page)));
    for (const v of ['stats', 'explore', 'settings']) {
      await page.click('.topnav [data-action="view"][data-view="' + v + '"], nav [data-action="view"][data-view="' + v + '"]');
      await L.sleep(700);
      say('  click ' + v + ' -> ' + JSON.stringify(await where(page)));
    }
    for (let i = 0; i < 3; i++) {
      await page.goBack({ waitUntil: 'commit' }).catch(e => say('  goBack error ' + e.message.split('\n')[0]));
      await L.sleep(900);
      const u = page.url();
      say('  browser back ' + (i + 1) + ' -> ' + (u.startsWith('http') ? JSON.stringify(await where(page)) : u));
      if (!u.startsWith('http')) break;
    }
    await L.home(sess); await L.waitMenu(page);
    for (const h of ['#stats', '#explore', '#explore=japan', '#settings', '#bogus', '#explore=notacountry', '']) {
      await page.evaluate(x => { location.hash = x; }, h); await L.sleep(900);
      const w = await where(page);
      say('  hash "' + h + '" -> screen ' + w.screen + ' url ' + w.url + ' hist ' + w.hist + (h.indexOf('explore=') !== -1 ? ' selected ' + (await page.evaluate(() => window.__atlas.explore.selected || (document.getElementById('place-name') || {}).textContent || null)) : '') + ' notice "' + w.notice + '"');
    }
    // a hash typed while a round is on
    await L.hookStart(page, 'oceania'); await L.waitRound(sess, 'oceania');
    const a = await L.answerQuestion(sess, 'right'); await L.waitNextQuestion(sess, a);
    await page.evaluate(() => { location.hash = '#stats'; }); await L.sleep(700);
    say('  "#stats" during a round -> ' + JSON.stringify(await where(page)));
    await page.goBack({ waitUntil: 'commit' }).catch(() => {}); await L.sleep(900);
    say('  then browser back -> ' + (page.url().startsWith('http') ? JSON.stringify(await where(page)) + ' state ' + JSON.stringify(await page.evaluate(() => ({ cur: window.__atlas.state.current, seq: window.__atlas.state.sequence.length }))) : page.url()));
    // browser back out of a round and forward again
    await L.home(sess); await L.waitMenu(page);
    await Pl.startFromHome(sess, 'oceania', { difficulty: 'normal', map: 'parchment' });
    await L.waitRound(sess, 'oceania');
    const b = await L.answerQuestion(sess, 'second'); await L.waitNextQuestion(sess, b);
    const m0 = await Pl.mdump(page);
    say('  in a round: ' + JSON.stringify(await where(page)));
    await page.goBack({ waitUntil: 'commit' }).catch(e => say('  goBack: ' + e.message.split('\n')[0])); await L.sleep(1200);
    say('  browser back from a round -> ' + page.url().slice(0, 60));
    if (!page.url().startsWith('http')) { await page.goForward({ waitUntil: 'domcontentloaded' }).catch(() => {}); await L.sleep(2500); }
    const w2 = await where(page).catch(() => null);
    say('  forward again -> ' + JSON.stringify(w2) + ' round ' + JSON.stringify(await page.evaluate(() => window.__atlas && ({ cur: !!window.__atlas.state.current, seq: window.__atlas.state.sequence.length, total: window.__atlas.state.totalQuestions })).catch(() => null)));
    const m1 = await Pl.mdump(page).catch(() => null);
    if (m1 && m1.answers !== m0.answers) say('  PROBLEM mastery answers changed across back/forward ' + m0.answers + ' -> ' + m1.answers);
    say('  errors ' + JSON.stringify(errsOf(sess)));
    await sess.close();
  }

  if (part.includes('links')) {
    const sess = await L.open(); const page = sess.page;
    const links = ['?play=europe', '?play=europe&learn=1', '?play=world&learn=1', '?play=daily', '?play=pin-asia', '?play=capitals-find-europe', '?play=us-state&learn=1',
      '?play=nope', '?play=midwest-cities', '?play=', '?play=EUROPE', '?play=europe%20', '?play=north america', '?play=__proto__', '?play=constructor', '?play=daily&learn=1', '?play=name-world&learn=1', '?play=europe#stats', '?learn=1', '?play=russia'];
    for (const q of links) {
      await page.goto('about:blank');
      await page.goto(sess.url + q, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!(window.__atlas && window.__atlas.state.allFeatures && window.__atlas.state.allFeatures.length), null, { timeout: 20000 });
      await L.sleep(1800);
      const st = await L.snap(page); const w = await where(page);
      const ls = await page.evaluate(() => Object.keys(localStorage).join(','));
      say('LINK ' + q + ' -> screen ' + w.screen + ' mode ' + (w.screen === 'game' ? st.mode + ' ' + st.startArg + ' total ' + st.total + (st.learn ? ' learn L' + st.learn.level : '') : '-') + ' url ' + w.url + ' notice "' + w.notice + '" storage [' + ls + '] errors ' + JSON.stringify(errsOf(sess)));
      await page.evaluate(() => localStorage.clear());
    }
    await sess.close();
  }

  if (part.includes('resize')) {
    for (const mobile of [false, true]) {
      const sess = await L.open({ mobile }); const page = sess.page;
      await L.home(sess);
      await L.hookStart(page, 'europe'); await L.waitRound(sess, 'europe');
      const sizes = mobile ? [[844, 390], [390, 844], [360, 640]] : [[700, 500], [1600, 900], [1024, 400], [1280, 800]];
      let a = await L.answerQuestion(sess, 'right'); await L.waitNextQuestion(sess, a);
      for (const [w, h] of sizes) {
        await page.setViewportSize({ width: w, height: h }); await L.sleep(900);
        const geo = await page.evaluate(() => {
          const host = document.getElementById('globe-host'), r = host.getBoundingClientRect();
          const cv = Array.from(host.querySelectorAll('canvas')).map(c => c.width + 'x' + c.height + ' css ' + Math.round(c.getBoundingClientRect().width) + 'x' + Math.round(c.getBoundingClientRect().height));
          const pr = document.getElementById('prompt').getBoundingClientRect(), sk = document.getElementById('skip-btn').getBoundingClientRect();
          return { host: Math.round(r.width) + 'x' + Math.round(r.height), dpr: devicePixelRatio, cv, prompt: [Math.round(pr.left), Math.round(pr.top), Math.round(pr.right), Math.round(pr.bottom)], skip: [Math.round(sk.left), Math.round(sk.top), Math.round(sk.right), Math.round(sk.bottom)], vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth };
        });
        let res;
        try { a = await L.answerQuestion(sess, w % 2 ? 'second' : 'right'); await L.waitNextQuestion(sess, a); res = 'answered ' + a.name + ' (' + a.how + ')'; } catch (e) { res = 'PROBLEM could not answer: ' + e.message.split('\n')[0]; }
        say('RESIZE ' + (mobile ? 'phone' : 'desktop') + ' ' + w + 'x' + h + ': ' + res + ' | ' + JSON.stringify(geo));
        await page.screenshot({ path: 'shots/resize-' + (mobile ? 'm' : 'd') + '-' + w + 'x' + h + '.png' });
      }
      // Pin: aim, resize, drop
      await page.keyboard.press('Escape'); await L.sleep(400);
      await L.hookStart(page, 'pin-europe'); let st = await L.waitRound(sess, 'pin');
      const truth = L.PIN_CITIES[st.current];
      await L.MapAdapter.pinAt(page, truth[0], truth[1]);
      await L.waitState(page, s => s.pin && s.pin.hasGuess, 'pin aimed', 3000);
      await page.setViewportSize(mobile ? { width: 844, height: 390 } : { width: 900, height: 600 }); await L.sleep(900);
      if (mobile) await page.locator('#pin-btn').tap(); else await page.keyboard.press('Enter');
      st = await L.waitState(page, s => s.pin && s.pin.phase === 'reveal', 'reveal', 4000);
      say('RESIZE pin ' + (mobile ? 'phone' : 'desktop') + ': aimed at ' + st.pin.results[0].name + ', resized, dropped -> ' + Math.round(st.pin.results[0].km) + ' km, ' + st.pin.results[0].pts + ' pts' + (st.pin.results[0].km > 120 ? '  PROBLEM the pin moved' : ''));
      await page.screenshot({ path: 'shots/resize-pin-' + (mobile ? 'm' : 'd') + '.png' });
      say('  errors ' + JSON.stringify(errsOf(sess)));
      await sess.close();
    }
  }

  if (part.includes('tabs')) {
    const sess = await L.open(); const t1 = sess.page;
    await L.home(sess); await L.waitMenu(t1);
    const t2 = await sess.context.newPage();
    const s2 = { page: t2, url: sess.url, errors: [], log: [] };
    t2.on('pageerror', e => s2.errors.push(e.message));
    await L.home(s2); await L.waitMenu(t2);
    // tab 1 starts Oceania and answers two; tab 2 plays South America in full; tab 1 finishes
    await L.hookStart(t1, 'oceania'); await L.waitRound(sess, 'oceania t1');
    let a = await L.answerQuestion(sess, 'right'); await L.waitNextQuestion(sess, a);
    a = await L.answerQuestion(sess, 'miss'); await L.waitNextQuestion(sess, a);
    await t2.bringToFront();
    await L.hookStart(t2, 'south-america'); await L.waitRound(s2, 'south-america t2');
    const r2 = await Pl.playChecked(s2, { how: i => (i === 2 ? 'second' : 'right'), skill: 'country' });
    r2.problems.forEach(p => say('  PROBLEM t2 ' + p));
    await L.sleep(400);
    await t1.bringToFront(); await L.sleep(300);
    const mid = await L.snap(t1);
    say('TABS t1 round still on after t2 finished one: screen ' + mid.screen + ' answered ' + mid.sequence.length + ' current ' + !!mid.current);
    const r1 = await Pl.playChecked(sess, { how: () => 'right', skill: 'country' });
    r1.problems.forEach(p => say('  PROBLEM t1 ' + p));
    await L.sleep(400);
    const recs = await L.store(t1, 'atlas-records');
    const md = await Pl.mdump(t1);
    say('TABS records keys ' + Object.keys(recs).join(', ') + ' | mastery answers ' + md.answers + ' (7 + 13 = 20 wanted) games ' + md.totals.games + ' (2 wanted) | focus ' + JSON.stringify(Object.keys(await L.store(t1, 'atlas-focus'))));
    const md2 = await Pl.mdump(t2);
    say('TABS t2 sees answers ' + md2.answers + ' games ' + md2.totals.games);
    // t2 is on results; go Home there: does it show t1's Oceania best?
    await t2.bringToFront(); await t2.click('#home-btn'); await L.waitMenu(t2); await L.sleep(300);
    say('TABS t2 Home Oceania card: ' + (await t2.evaluate(() => document.querySelector('[data-level="oceania"]').innerText.replace(/\s+/g, ' '))));
    // Home open in t2 while t1 plays another round: does t2's Home update by itself?
    await t1.bringToFront(); await t1.click('#home-btn'); await L.waitMenu(t1);
    await L.hookStart(t1, 'capitals-oceania'); await L.waitRound(sess, 'capitals t1');
    await Pl.playChecked(sess, { how: () => 'right', skill: 'capital' }); await L.sleep(500);
    say('TABS t2 Home (left open) capitals-oceania card after t1 played it: ' + (await t2.evaluate(() => { const c = document.querySelector('[data-level="capitals-oceania"]'); return c ? c.innerText.replace(/\s+/g, ' ') : 'card not shown'; })));
    // reset in t1 while t2 has Home open, then t2 plays
    await t1.evaluate(() => window.__atlas.resetProgress()); await L.sleep(500);
    await t2.bringToFront(); await L.sleep(400);
    say('TABS after reset in t1, t2 Home Oceania card: ' + (await t2.evaluate(() => document.querySelector('[data-level="oceania"]').innerText.replace(/\s+/g, ' '))) + ' | t2 mastery answers ' + (await Pl.mdump(t2)).answers);
    await L.hookStart(t2, 'oceania'); await L.waitRound(s2, 'oceania t2');
    await Pl.playChecked(s2, { how: () => 'right', skill: 'country' }); await L.sleep(400);
    const md3 = await Pl.mdump(t2);
    say('TABS t2 played Oceania after the reset: mastery answers ' + md3.answers + ' (7 wanted) records ' + Object.keys(await L.store(t2, 'atlas-records')).join(','));
    say('  errors t1 ' + JSON.stringify(errsOf(sess)) + ' t2 ' + JSON.stringify(s2.errors));
    await sess.close();
  }

  if (part.includes('storage')) {
    const modes = {
      'setItem throws (full)': () => { Storage.prototype.setItem = function () { throw new DOMException('quota', 'QuotaExceededError'); }; },
      'everything throws (blocked)': () => { ['getItem', 'setItem', 'removeItem', 'key', 'clear'].forEach(m => { Storage.prototype[m] = function () { throw new DOMException('denied', 'SecurityError'); }; }); },
      'localStorage getter throws': () => { Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); }, configurable: true }); }
    };
    for (const name of Object.keys(modes)) {
      const sess = await L.open({ init: modes[name] }); const page = sess.page;
      let line = 'STORAGE ' + name + ': ';
      try {
        await page.goto(sess.url, { waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => !!(window.__atlas && window.__atlas.state.allFeatures && window.__atlas.state.allFeatures.length), null, { timeout: 20000 });
        await L.waitMenu(page);
        line += 'Home ok; ';
        await Pl.startFromHome(sess, 'oceania', { difficulty: 'hard', map: 'satellite' });
        await L.waitRound(sess, 'oceania');
        const r = await L.playRound(sess, { how: i => ['right', 'second', 'miss', 'skip', 'right', 'right', 'right'][i] });
        line += 'round ' + r.asked.length + ' answered -> ' + r.state.screen + '; ';
        await L.sleep(400);
        line += 'results "' + (await page.evaluate(() => document.getElementById('results-summary').innerText.replace(/\s+/g, ' ').slice(0, 80))) + '"; ';
        await page.click('#practice-btn'); await L.waitRound(sess, 'practice'); await page.keyboard.press('Escape'); await L.sleep(400);
        for (const h of ['#stats', '#settings', '#explore', '']) { await page.evaluate(x => { location.hash = x; }, h); await L.sleep(600); }
        line += 'views ok; in-memory mastery answers ' + (await page.evaluate(() => { const m = window.__atlas.mastery; return m.totals().questions; })) + '; ';
        await page.evaluate(() => { location.hash = '#settings'; }); await L.sleep(400);
        await page.click('[data-action="set-theme"][data-value="dark"]').catch(() => {}); await L.sleep(200);
        await page.click('[data-action="export-progress"]').catch(e => { line += 'export click failed; '; }); await L.sleep(300);
        await page.click('[data-action="sync-create"]').catch(() => {}); await L.sleep(300);
        const dlg = await page.evaluate(() => { const d = document.getElementById('dialog'); return d && !d.hidden ? d.innerText.replace(/\s+/g, ' ').slice(0, 200) : null; });
        line += 'sync dialog: ' + dlg + '; ';
        if (dlg) { await page.fill('#sync-username-new', 'X').catch(() => {}); await page.click('#sync-create-btn').catch(() => {}); await L.sleep(600);
          line += 'after create: ' + (await page.evaluate(() => { const d = document.getElementById('dialog'); return (d && !d.hidden ? 'dialog: ' + d.innerText.replace(/\s+/g, ' ').slice(0, 160) : 'no dialog') + ' | sync card: ' + document.getElementById('settings-sync').innerText.replace(/\s+/g, ' ').slice(0, 160); })) + '; '; }
        await page.keyboard.press('Escape');
        await page.goto(sess.url + '?play=daily', { waitUntil: 'domcontentloaded' }); await L.waitRound(sess, 'daily');
        const d = await L.playRound(sess, {}); await L.sleep(300);
        await page.click('#home-btn'); await L.waitMenu(page);
        line += 'daily played -> card ' + (await page.evaluate(() => document.querySelector('#menu-screen .daily').dataset.daily)) + '; ';
      } catch (e) { line += 'CRASH ' + e.message.split('\n')[0]; try { await page.screenshot({ path: 'shots/crash-storage.png' }); } catch (e2) {} }
      say(line + ' errors ' + JSON.stringify(errsOf(sess).slice(0, 4)));
      await sess.close();
    }
  }
  fs.writeFileSync('nav-' + part.join('_') + '.out', out.join('\n') + '\n');
})().catch(e => { console.error(e); fs.writeFileSync('nav-crash.out', out.join('\n') + '\nCRASH ' + e.stack); process.exit(1); });
