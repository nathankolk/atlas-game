// Checks for the Stats page: the numbers it prints against the stores, its controls, its empty states.
//   NODE_PATH=/opt/node-tools/node_modules node check-stats.js [--mobile] [--only=name]
'use strict';
const path = require('path');
const fs = require('fs');
const S = path.resolve(__dirname, '../../..');
const { launch } = require(path.join(S, 'harness/atlas-harness.js'));
const mobile = process.argv.includes('--mobile');
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7);
const readSeed = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const RICH = path.join(S, 'harness/scratch/seed-rich.json');
const OLD = path.join(S, 'work/integration/shell/seed-old.json');
let fails = 0, passes = 0;
const ok = (cond, what) => { if (cond) passes++; else { fails++; console.log('  FAIL: ' + what); } };
const eq = (a, b, what) => ok(a === b, what + ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')');

async function open(seed, tail) {
  const h = await launch(Object.assign({ seedStorage: seed || {} }, mobile ? { mobile: true } : { width: 1280, height: 800 }));
  await h.page.goto(h.url + (tail || '#stats'));
  await h.page.waitForFunction(() => window.__atlas && window.__atlas.state.allFeatures.length > 0 && document.querySelector('#stats-content .kpis'), null, { timeout: 30000 });
  // Province maps arrive in the background and redraw the page
  await h.page.waitForFunction(() => !/Loading/.test(document.querySelector('.mtable').textContent), null, { timeout: 30000 });
  await h.page.waitForTimeout(300);
  return h;
}
const num = text => Number(String(text).replace(/[^0-9.\-]/g, ''));

const checks = {
  async 'rich player: figures match the stores'() {
    const seed = readSeed(RICH);
    const h = await open(seed);
    const page = h.page;
    const got = await page.evaluate(async () => {
      const A = window.__atlas, m = A.mastery;
      const text = sel => { const el = document.querySelector(sel); return el ? el.textContent : null; };
      // What the page printed, read before the remaining province maps are fetched for the comparison
      const printed = { mtable: document.querySelector('.mtable').outerHTML, kpis: document.querySelector('.kpis').outerHTML };
      await Promise.all(A.LEVELS.filter(l => l.available).map(l => l.load()));
      const kpis = Array.from(document.querySelectorAll('.kpi')).map(k => ({ label: k.querySelector('dt').textContent, value: k.querySelector('dd').textContent, sub: k.querySelector('.kpi-sub').textContent }));
      // Unique places per skill, counted from the levels themselves
      const bySkill = {};
      A.LEVELS.filter(l => l.available).forEach(l => { (bySkill[l.skill] = bySkill[l.skill] || new Set()); l.names().forEach(n => bySkill[l.skill].add(n)); });
      let mastered = 0, total = 0;
      Object.keys(bySkill).forEach(skill => { const s = m.summary(skill, Array.from(bySkill[skill])); mastered += s.mastered; total += s.total; });
      const act = m.activity(30).reduce((a, d) => { a.q += d.questions; a.f += d.firstTry; return a; }, { q: 0, f: 0 });
      const groups = Array.from(document.querySelectorAll('.mtable tbody')).map(tb => {
        const cells = r => Array.from(r.querySelectorAll('.mtable-n')).map(td => parseInt(td.textContent.replace(/,/g, ''), 10));
        return { name: tb.querySelector('.mtable-toggle').textContent, group: cells(tb.querySelector('.mtable-group')),
          total: tb.querySelector('.mtable-group .mtable-total').textContent,
          levels: Array.from(tb.querySelectorAll('.mtable-level')).map(r => ({ name: r.querySelector('th').textContent, n: cells(r), total: r.querySelector('.mtable-total').textContent })) };
      });
      // A level of a collection with two sets (Capitals) is listed with its set: "Europe · Find the country"
      const fullTitle = l => { const c = A.COLLECTIONS.find(x => x.key === l.collection); const v = l.variant && c.variants.find(x => x.key === l.variant); return v ? l.title + ' · ' + v.label : l.title; };
      const levelSums = A.LEVELS.filter(l => l.available).map(l => { const s = m.summary(l.skill, l.names()); return { title: fullTitle(l), n: [s.mastered, s.familiar, s.learning, s.new], total: s.total }; });
      const records = JSON.parse(localStorage.getItem('atlas-records'));
      const pin = JSON.parse(localStorage.getItem('atlas-pin'));
      return {
        kpis, mastered, total, pct: Math.round(act.f / act.q * 100), totals: m.totals(), streak: m.streak(), groups, levelSums,
        recordKeys: Object.keys(records), recordRows: Array.from(document.querySelectorAll('.records tbody tr:not(.records-group)')).map(r => Array.from(r.children).map(c => c.textContent)),
        recsItems: document.querySelectorAll('.recs li:not(.recs-group)').length,
        weak: Array.from(document.querySelectorAll('.weak li')).map(li => ({ name: li.querySelector('strong').textContent, sub: li.querySelector('small').textContent, pct: parseInt(li.querySelector('.weak-pct').textContent, 10) })),
        weakButton: text('[data-action="practice-weak"]'),
        daily: { figs: Array.from(document.querySelectorAll('.figs dd')).map(d => d.textContent), strip: Array.from(document.querySelectorAll('.strip li')).map(li => li.textContent), cols: Array.from(document.querySelectorAll('.cols[style*="11"] li')).map(li => (li.querySelector('b') || {}).textContent || '0') },
        dailyStore: JSON.parse(localStorage.getItem('atlas-daily-attempts')),
        pinRows: Array.from(document.querySelectorAll('.pintable tbody tr')).map(r => Array.from(r.children).map(c => c.textContent)),
        pinGames: pin.games,
        calCells: document.querySelectorAll('.cal-grid i').length, calActive: document.querySelectorAll('.cal-grid i:not(.h0):not(.is-future)').length,
        calFoot: text('.cal-foot'), calSums: Array.from(document.querySelectorAll('.cal-sums span')).map(s => s.textContent),
        act84: m.activity(84),
        sameAfterLoad: printed.mtable === document.querySelector('.mtable').outerHTML && printed.kpis === document.querySelector('.kpis').outerHTML,
        titles: document.querySelectorAll('[title]').length,
        overflowX: document.getElementById('stats-screen').scrollWidth - document.getElementById('stats-screen').clientWidth,
        empties: document.querySelectorAll('#stats-content .empty').length
      };
    });
    const kpi = label => got.kpis.find(k => k.label === label);
    eq(num(kpi('Places mastered').value.split('of')[0]), got.mastered, 'places mastered');
    eq(num(kpi('Places mastered').value.split('of')[1]), got.total, 'places in all');
    eq(num(kpi('First-try accuracy').value), got.pct, 'first-try accuracy, last 30 days');
    eq(num(kpi('Day streak').value), got.streak.current, 'day streak');
    ok(kpi('Day streak').sub.indexOf(String(got.streak.longest)) !== -1, 'longest streak printed: ' + kpi('Day streak').sub);
    eq(num(kpi('Rounds played').value), got.totals.games, 'rounds played');
    const mins = Math.round(got.totals.seconds / 60);
    eq(kpi('Time played').value, Math.floor(mins / 60) + 'h' + String(mins % 60).padStart(2, '0') + 'm', 'time played');

    // Mastery table: every level row equals mastery.summary for that level
    const rows = [].concat.apply([], got.groups.map(g => g.levels));
    eq(rows.length, got.levelSums.length, 'one mastery row per playable level');
    got.levelSums.forEach((want, i) => {
      eq(rows[i].name + ' ' + rows[i].n.join(','), want.title + ' ' + want.n.join(','), 'mastery row ' + want.title);
      eq(num(rows[i].total), want.total, 'total for ' + want.title);
    });
    eq(got.groups.length, 7, 'seven collections');
    eq(got.groups.reduce((n, g) => n + g.group[0], 0), got.mastered, 'collection rows add up to the headline figure');

    // Records: one row per stored key (all of the seed's keys belong to playable levels or the Daily Five)
    eq(got.recordRows.length, got.recordKeys.length, 'one records row per stored record');
    eq(got.recsItems, got.recordKeys.length, 'the phone list holds the same rows');
    const recs = JSON.parse(seed['atlas-records']);
    const worldRow = got.recordRows.find(r => r[0] === 'The World' && r[1] === 'Normal');
    const world = recs['world-country|World|normal'];
    ok(worldRow && worldRow[2].indexOf(world.bestAccuracy.correct + ' / ' + world.bestAccuracy.total) === 0 && worldRow[3] === world.bestAccuracy.pct + '%' &&
      worldRow[4] === world.bestScore.value + ' / ' + world.bestScore.max && num(worldRow[6]) === world.gamesPlayed, 'The World row prints the stored record: ' + JSON.stringify(worldRow));
    const usRow = got.recordRows.find(r => r[0] === 'States → Capitals');
    ok(!!usRow, 'the capitals record is listed under its level title, read from its stored key');
    const sweep = got.recordRows.find(r => r[0] === 'Canada' && r[1] === 'Normal');
    const canada = recs['province|canada-provinces|normal'];
    ok(sweep && canada.bestTime && sweep[5] === Math.floor(canada.bestTime.value / 60) + ':' + String(canada.bestTime.value % 60).padStart(2, '0'), 'best time printed for a clean sweep: ' + JSON.stringify(sweep));
    ok(got.recordRows.some(r => r[0] === 'Daily Five'), 'Daily Five has a row');

    // Needs work
    ok(got.weak.length > 0 && got.weak.length <= 8, 'needs-work rows: ' + got.weak.length);
    ok(got.weak.every((w, i) => w.pct < 70 && (i === 0 || w.pct >= got.weak[i - 1].pct)), 'weakest first, all under 70%: ' + got.weak.map(w => w.pct).join(','));
    ok(got.weak.every(w => /first try \d+ of \d+/.test(w.sub) && !/Pin the City/.test(w.sub)), 'each row names its skill and tries');
    ok(new RegExp(String(got.weak.length)).test(got.weakButton), 'the action counts its rows: ' + got.weakButton);

    // Daily Five
    const days = Object.keys(got.dailyStore);
    eq(got.daily.strip.length, 30, 'thirty days in the strip');
    eq(got.daily.strip.filter(t => t !== '').length, days.length, 'played days in the strip');
    eq(num(got.daily.figs[2].split('of')[0]), days.length, 'days played');
    const scores = days.map(d => got.dailyStore[d].score);
    eq(got.daily.figs[3].split('of')[0], (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1), 'average score');
    eq(got.daily.cols.map(Number).join(','), Array.from({ length: 11 }, (_, sc) => scores.filter(x => x === sc).length).join(','), 'score distribution');

    // Pin the City
    const europe = got.pinGames.filter(g => g.region === 'Europe');
    const europeRow = got.pinRows.find(r => r[0] === 'Europe');
    ok(europeRow && num(europeRow[2]) === europe.length && num(europeRow[3]) === Math.max.apply(null, europe.map(g => g.score)), 'Europe rounds and best: ' + JSON.stringify(europeRow));
    const eKms = europe.slice(-10).filter(g => g.avgKm != null).map(g => g.avgKm);
    eq(num(europeRow[1]), Math.round(eKms.reduce((a, b) => a + b, 0) / eKms.length), 'Europe average distance');
    ok(got.pinRows.find(r => r[0] === 'Oceania')[1] === 'Not played yet', 'an unplayed region says so');
    eq(got.pinRows.length, 7, 'seven pin regions');

    // Activity calendar
    eq(got.calCells, 84, 'twelve weeks of cells');
    const weekday = (new Date().getDay() + 6) % 7;
    const shown = got.act84.slice(84 - (77 + weekday + 1));
    eq(got.calActive, shown.filter(d => d.questions > 0).length, 'shaded days');
    eq(got.calSums.map(t => t === '–' ? 0 : Number(t)).reduce((a, b) => a + b, 0), shown.reduce((a, d) => a + d.questions, 0), 'weekly totals add up');
    ok(got.calFoot.indexOf(shown.filter(d => d.games > 0).length + ' active') !== -1, 'active days printed: ' + got.calFoot);

    ok(got.sameAfterLoad, 'figures drawn before the province maps load are the same ones as after');
    eq(got.titles, 0, 'no title= attributes');
    ok(got.overflowX <= 0, 'no sideways scroll: ' + got.overflowX);
    eq(got.empties, 0, 'no empty states for a rich player');
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  async 'controls: groups, show all, practice these'() {
    const h = await open(readSeed(RICH));
    const page = h.page;
    const before = await page.evaluate(() => [localStorage.getItem('atlas-records'), localStorage.getItem('atlas-focus')]);
    const first = await page.evaluate(() => { const b = document.querySelector('.mtable-toggle'); return { open: b.getAttribute('aria-expanded'), shown: b.closest('tbody').querySelectorAll('.mtable-level:not([hidden])').length }; });
    eq(first.open, String(!mobile), 'collections start ' + (mobile ? 'folded on a phone' : 'open on a wide window'));
    eq(first.shown, mobile ? 0 : 7, 'levels showing at first');
    await page.locator('.mtable-toggle').first().click();
    const second = await page.evaluate(() => { const b = document.querySelector('.mtable-toggle'); return { open: b.getAttribute('aria-expanded'), shown: b.closest('tbody').querySelectorAll('.mtable-level:not([hidden])').length }; });
    eq(second.open, String(mobile), 'the toggle flips aria-expanded');
    eq(second.shown, mobile ? 7 : 0, 'and shows or hides the levels');
    // The choice survives a redraw
    await page.evaluate(() => window.__atlas.showView('home'));
    await page.evaluate(() => window.__atlas.showView('stats'));
    eq(await page.evaluate(() => document.querySelector('.mtable-toggle').getAttribute('aria-expanded')), String(mobile), 'the toggle is remembered across redraws');
    // Keyboard reaches it
    await page.locator('.mtable-toggle').first().focus();
    await page.keyboard.press('Enter');
    eq(await page.evaluate(() => document.querySelector('.mtable-toggle').getAttribute('aria-expanded')), String(!mobile), 'Enter works the toggle');

    if (mobile) {
      const hidden = await page.evaluate(() => document.querySelectorAll('.recs li[hidden]').length);
      ok(hidden > 0, 'the phone list starts folded: ' + hidden + ' hidden');
      await page.locator('[data-action="show-all-records"]').click();
      eq(await page.evaluate(() => document.querySelectorAll('.recs li[hidden]').length + ':' + !!document.querySelector('[data-action="show-all-records"]')), '0:false', 'Show all unfolds the list and goes away');
    }

    const weak = await page.evaluate(() => Array.from(document.querySelectorAll('.weak strong')).map(s => s.textContent));
    await page.locator('[data-action="practice-weak"]').click();
    await page.waitForFunction(() => document.body.dataset.screen === 'game' && window.__atlas.state.current, null, { timeout: 30000 });
    const seen = [];
    for (let guard = 0; guard < 10; guard++) {
      const s = await page.evaluate(() => { const st = window.__atlas.state; return { practice: st.practice, names: st.queue.map(q => q.name || q).concat([st.current && (st.current.name || st.current)]), total: st.totalQuestions, left: st.review ? st.review.queue.length : null }; });
      ok(!!s.practice && s.left !== null, 'a practice round inside a review playlist');
      seen.push(s.total);
      for (let i = 0; i < 80; i++) {
        if (await page.evaluate(() => document.body.dataset.screen === 'results')) break;
        await page.keyboard.press('s');
        await page.waitForTimeout(250);
      }
      await page.waitForFunction(() => document.body.dataset.screen === 'results', null, { timeout: 20000 });
      const next = await page.evaluate(() => { const b = document.getElementById('review-next-btn'); return b.hidden ? null : b.textContent; });
      if (!next) break;
      await page.locator('#review-next-btn').click();
      await page.waitForFunction(() => document.body.dataset.screen === 'game' && window.__atlas.state.current, null, { timeout: 30000 });
    }
    eq(seen.reduce((a, b) => a + b, 0), weak.length, 'the playlist asks exactly the listed places (' + seen.join('+') + ')');
    const after = await page.evaluate(() => [localStorage.getItem('atlas-records'), localStorage.getItem('atlas-focus')]);
    ok(before[0] === after[0] && before[1] === after[1], 'practice leaves records and focus lists alone');
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  async 'new player: empty states'() {
    const h = await open({});
    const got = await h.page.evaluate(() => ({
      kpis: Array.from(document.querySelectorAll('.kpi dd')).map(d => d.textContent),
      empties: Array.from(document.querySelectorAll('#stats-content .empty p')).map(p => p.textContent.slice(0, 24)),
      lead: document.querySelector('.page-head p:not(.eyebrow)').textContent,
      mrows: document.querySelectorAll('.mtable-level').length, cal: document.querySelectorAll('.cal-grid i').length,
      storage: Object.keys(localStorage), titles: document.querySelectorAll('[title]').length
    }));
    eq(got.kpis.join(''), '—————', 'five dashes, not zeros');
    eq(got.empties.length, 4, 'needs work, Daily Five, Pin the City and records each say they are empty: ' + got.empties.join(' | '));
    ok(/Nothing has been played/.test(got.lead), 'the page says why it is empty');
    eq(got.mrows, 52, 'the mastery table still lists every level');
    eq(got.cal, 84, 'the calendar is drawn empty');
    ok(!got.storage.some(k => /atlas-(records|focus|pin|learn|daily|mastery)/.test(k)), 'looking at Stats wrote no progress: ' + got.storage.join(','));
    await h.page.locator('#stats-content [data-action="play-daily"]').click();
    await h.page.waitForFunction(() => document.body.dataset.screen === 'game' && window.__atlas.state.gameMode === 'daily-five', null, { timeout: 20000 });
    ok(true, 'the Daily Five empty state starts today’s puzzle');
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
    await h.close();
  },

  async 'old stores only: records without mastery'() {
    const seed = readSeed(OLD);
    const h = await open(seed);
    const got = await h.page.evaluate(() => ({
      kpis: Array.from(document.querySelectorAll('.kpi dd')).map(d => d.textContent),
      rows: Array.from(document.querySelectorAll('.records tbody tr:not(.records-group)')).map(r => r.children[0].textContent + '|' + r.children[1].textContent),
      strip: Array.from(document.querySelectorAll('.strip li')).filter(li => li.textContent).length,
      pin: Array.from(document.querySelectorAll('.pintable tbody tr')).filter(r => /km/.test(r.textContent)).length,
      lead: !!document.querySelector('.page-head p:not(.eyebrow)')
    }));
    const keys = Object.keys(JSON.parse(seed['atlas-records']));
    eq(got.rows.length, keys.length, 'every old record is listed: ' + got.rows.length + ' of ' + keys.length);
    ok(got.rows.indexOf('Capitals → States|Normal') !== -1 && got.rows.indexOf('States|Normal') !== -1 && got.rows.indexOf('Cities: Northeast|Normal') !== -1,
      'old US records appear under their level titles');
    ok(got.strip > 0, 'old daily attempts fill the strip: ' + got.strip);
    ok(got.pin > 0, 'old pin games fill the regions: ' + got.pin);
    eq(got.kpis[0], '—', 'no mastery yet: the headline stays a dash');
    ok(!got.lead, 'not treated as a brand-new player');
    eq(h.errors.length, 0, 'page errors: ' + h.errors.join(' | '));
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
