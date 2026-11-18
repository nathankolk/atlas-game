// Name It through the real field: twenty aliases, twenty misspellings, the Niger/Nigeria cases; and a scan of the page
// for anything that gives the answer away while a question is open (every mode).
'use strict';
const fs = require('fs');
const L = require('./lib.js');
const Pl = require('./play.js');
const mobile = process.argv.includes('--mobile');
const out = [];
const say = s => { out.push(s); console.log(s); };
const T = [
  ['Ivory Coast', "cote d'ivoire", 'Ivory Cost'], ['Democratic Republic of the Congo', 'drc', 'Democratic Republic of the Kongo'],
  ['United States', 'usa', 'Untied States'], ['United Kingdom', 'great britain', 'United Kingdon'], ['Netherlands', 'holland', 'Netherland'],
  ['Czech Republic', 'czechia', 'Czech Republik'], ['Myanmar', 'burma', 'Myanmmar'], ['Eswatini', 'swaziland', 'Eswatani'],
  ['North Macedonia', 'macedonia', 'North Macedona'], ['Timor-Leste', 'east timor', 'Timor Lest'],
  ['Bosnia and Herzegovina', 'bosnia', 'Bosnia and Herzegovnia'], ['Turkey', 'turkiye', 'Turky'], ['Cape Verde', 'cabo verde', 'Cape Verd'],
  ['South Korea', 'republic of korea', 'South Koera'], ['United Arab Emirates', 'uae', 'United Arab Emirate'],
  ['Saint Kitts and Nevis', 'st kitts', 'Saint Kits and Nevis'], ['Trinidad and Tobago', 'trinidad', 'Trinidad and Tobaga'],
  ['Kyrgyzstan', 'kyrgyz republic', 'Kirgizstan'], ['Philippines', 'the philippines', 'Phillipines'], ['New Zealand', 'aotearoa', 'New Zeland']
];
const byName = {}; T.forEach(t => { byName[t[0]] = t; });
const hud = page => page.evaluate(() => ({
  toast: document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').innerText.replace(/\s+/g, ' ').trim() : '',
  toastKind: document.getElementById('toast').className, field: document.getElementById('answer-input').value,
  form: document.getElementById('answer-form').className, tryMark: !document.getElementById('prompt-try').hidden,
  note: document.getElementById('prompt-note').hidden ? '' : document.getElementById('prompt-note').textContent
}));

(async () => {
  const sess = await L.open({ mobile });
  const page = sess.page;
  await L.home(sess); await L.waitMenu(page);
  for (const round of ['alias', 'misspelling']) {
    await page.evaluate(names => window.__atlas.startGame('name-world', { practice: names }), T.map(t => t[0]));
    let st = await L.waitRound(sess, 'name-it ' + round);
    say('ROUND ' + round + ': ' + st.total + ' questions, practice ' + st.practice);
    while (st.screen === 'game') {
      const name = st.current, n = st.sequence.length;
      const text = byName[name][round === 'alias' ? 1 : 2];
      const m0 = await Pl.mdump(page);
      const inp = page.locator('#answer-input');
      await inp.fill('');
      await inp.type(text, { delay: 8 });
      await L.sleep(120);
      let s1 = await L.snap(page), auto = s1.sequence.length === n + 1, h = await hud(page), entered = false;
      if (!auto) {
        await page.keyboard.press('Enter'); entered = true; await L.sleep(150);
        s1 = await L.snap(page); h = await hud(page);
      }
      let line = '  ' + name + ' <- "' + text + '": ' + (auto ? 'taken as typed' : 'after Enter') + ' -> ';
      if (s1.sequence.length === n + 1) {
        const m1 = await Pl.mdump(page);
        const d = Pl.mdiff(m0, m1);
        line += 'points ' + s1.sequence[n] + ' | toast "' + h.toast + '" | field "' + h.field + '" ' + h.form.replace('answer', '').trim() + ' | mastery ' + JSON.stringify(d);
        if (d.length !== 1 || d[0].skill !== 'country-name' || d[0].name !== name) line += '  PROBLEM mastery';
        if (s1.sequence[n] !== 2) line += '  PROBLEM points';
      } else {
        line += 'NOT accepted: attempts ' + s1.attempts + ' picks? toast "' + h.toast + '" try-mark ' + h.tryMark;
        if (s1.attempts > 0) line += '  PROBLEM cost a try';
        // finish the question with the proper name
        await inp.fill(''); await inp.type(name, { delay: 5 }); await L.sleep(100);
        let s2 = await L.snap(page);
        if (s2.sequence.length !== n + 1) { await page.keyboard.press('Enter'); await L.sleep(100); s2 = await L.snap(page); }
        line += ' ; then the proper name -> points ' + s2.sequence[n];
      }
      say(line);
      st = await L.waitState(page, s => s.screen !== 'game' || (s.current && s.current !== name && !s.locked), 'next after ' + name, 9000);
    }
    await L.sleep(300);
    say('  results: ' + (await page.evaluate(() => document.getElementById('results-summary').innerText.replace(/\s+/g, ' '))));
    await page.click('#home-btn'); await L.waitMenu(page);
  }

  // Prefix cases
  const cases = [
    ['Nigeria', ['Niger'], 'none', 'ia'], ['Niger', ['Niger'], 'none', '\n'], ['Guinea-Bissau', ['Guinea'], 'none', '-Bissau'],
    ['Dominican Republic', ['Dominica'], 'none', 'n Republic'], ['Guinea', ['Guinea'], 'none', '\n'], ['Dominica', ['Dominica'], 'none', '\n']
  ];
  await page.evaluate(names => window.__atlas.startGame('name-world', { practice: names }), cases.map(c => c[0]));
  let st = await L.waitRound(sess, 'prefix cases');
  while (st.screen === 'game') {
    const name = st.current, n = st.sequence.length, c = cases.find(x => x[0] === name);
    const inp = page.locator('#answer-input');
    await inp.fill(''); await inp.type(c[1][0], { delay: 8 }); await L.sleep(200);
    const mid = await L.snap(page);
    let line = '  ' + name + ': typed "' + c[1][0] + '" -> answered ' + (mid.sequence.length - n) + ', attempts ' + mid.attempts;
    if (mid.sequence.length !== n || mid.attempts !== 0) line += '  PROBLEM a prefix was acted on';
    if (c[3] === '\n') await page.keyboard.press('Enter'); else await inp.type(c[3], { delay: 8 });
    await L.sleep(200);
    const end = await L.snap(page);
    line += ' ; then "' + c[3].replace('\n', '<Enter>') + '" -> points ' + end.sequence[n];
    if (end.sequence[n] !== 2) line += '  PROBLEM';
    say(line);
    st = await L.waitState(page, s => s.screen !== 'game' || (s.current && s.current !== name && !s.locked), 'next', 9000);
  }
  await page.click('#home-btn'); await L.waitMenu(page);

  // Wrong tries, unknown text, a country from outside the level
  await L.hookStart(page, 'name-oceania');
  st = await L.waitRound(sess, 'name-oceania');
  const cur = st.current;
  const other = st.queue[0];
  const seq = [];
  const inp = page.locator('#answer-input');
  const typeEnter = async t => { await inp.fill(''); await inp.type(t, { delay: 5 }); await page.keyboard.press('Enter'); await L.sleep(200); const s = await L.snap(page); const h = await hud(page); return 'typed "' + t + '": attempts ' + s.attempts + ' answered ' + s.sequence.length + ' toast "' + h.toast + '" try ' + h.tryMark + ' field "' + h.field + '"'; };
  say('WRONG/UNKNOWN (question ' + cur + '): ' + await typeEnter('asdfgh'));
  say('  ' + await typeEnter('Republic of Chad'));
  say('  ' + await typeEnter('   '));
  say('  ' + await typeEnter('France'));
  say('  ' + await typeEnter(other));
  await L.sleep(2500);
  say('  after two wrong: ' + JSON.stringify(await hud(page)) + ' sequence ' + (await L.snap(page)).sequence);
  await page.keyboard.press('Escape'); await L.sleep(300);
  say('  Escape in Name It -> ' + JSON.stringify((await L.snap(page)).sequence) + ' screen ' + (await L.snap(page)).screen);
  await page.click('#back-btn'); await L.sleep(400);

  // Hint scan: with a question open, is the answer anywhere in the page?
  const scan = () => {
    const a = window.__atlas, s = a.state;
    const answer = s.current;
    const html = document.getElementById('game-screen').outerHTML + ' ' + document.title + ' ' + location.href + ' ' + Array.from(document.body.attributes).map(x => x.value).join(' ') + ' ' + (document.getElementById('app-notice') || {}).outerHTML;
    const fold = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const where = [];
    const idx = fold(html).indexOf(fold(answer));
    if (idx !== -1) where.push(html.slice(Math.max(0, idx - 90), idx + answer.length + 30).replace(/\s+/g, ' '));
    let cap = null;
    try { cap = a.Quiz.capitalOf(a.WORLD_FACTS, answer); } catch (e) {}
    const m = a.map;
    const fk = s.featureByCanonical && s.featureByCanonical.get(answer);
    const key = fk ? 'name:' + fk.properties.name : null;
    return { mode: s.gameMode, answer, found: where, prompt: document.getElementById('prompt').innerText.replace(/\s+/g, ' '),
      capital: cap && cap.capital, labels: (m.labels || []).length, promptKey: m.promptKey, answerKey: key,
      mark: key && m.marks && m.marks.get ? m.marks.get(key) || null : null, tint: key && m.tints && m.tints.get ? m.tints.get(key) || null : null,
      outlines: (m.outlines || []).map(o => o.kind + ':' + (o.key || '')).slice(0, 5), cursor: getComputedStyle(document.getElementById('globe-host')).cursor,
      choices: Array.from(document.querySelectorAll('#choices-panel button')).map(b => b.outerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '')).slice(0, 4),
      active: document.activeElement && (document.activeElement.id || document.activeElement.tagName), mapKeys: Object.keys(m) };
  };
  for (const [slug, diff] of [['name-oceania', 'normal'], ['name-oceania', 'uncharted'], ['flags-oceania', 'normal'], ['flags-oceania', 'uncharted'], ['capitals-find-oceania', 'normal'], ['capitals-oceania', 'normal'], ['us-capital-to-state', 'normal'], ['us-state-to-capital', 'normal'], ['pin-oceania', 'normal'], ['northeast-cities', 'normal']]) {
    await page.evaluate(d => { const b = document.querySelector('[data-action="set-difficulty"][data-value="' + d + '"]'); if (b) b.click(); }, diff);
    await L.hookStart(page, slug);
    await L.waitRound(sess, slug);
    await L.sleep(700);
    const r = await page.evaluate(scan);
    say('HINTSCAN ' + slug + ' ' + diff + ': answer "' + r.answer + '" prompt "' + r.prompt.slice(0, 90) + '" | in page: ' + (r.found.length ? 'YES ' + JSON.stringify(r.found) : 'no') + ' | labels ' + r.labels + ' promptKey ' + r.promptKey + ' answerKey ' + r.answerKey + ' mark ' + JSON.stringify(r.mark) + ' tint ' + JSON.stringify(r.tint) + ' outlines ' + JSON.stringify(r.outlines) + ' cursor ' + r.cursor);
    if (r.choices.length) say('   choices: ' + r.choices.join(' '));
    if (slug === 'name-oceania' && diff === 'normal') {
      // type the first three letters: nothing may complete it
      await page.locator('#answer-input').type(r.answer.slice(0, 3), { delay: 20 }); await L.sleep(300);
      const r2 = await page.evaluate(scan);
      say('   after typing "' + r.answer.slice(0, 3) + '": in page: ' + (r2.found.length ? 'YES ' + JSON.stringify(r2.found) : 'no') + ' field "' + (await page.inputValue('#answer-input')) + '" attrs ' + (await page.evaluate(() => { const i = document.getElementById('answer-input'); return Array.from(i.attributes).map(a => a.name + '=' + a.value).join(' '); })));
    }
    await page.screenshot({ path: 'shots/hint-' + slug + '-' + diff + (mobile ? '-m' : '') + '.png' });
    await page.click('#back-btn'); await L.sleep(400);
  }
  say('page errors: ' + JSON.stringify(sess.errors.filter(e => !/Failed to load resource/.test(e)).slice(0, 5)));
  await sess.close();
  fs.writeFileSync('typed' + (mobile ? '-m' : '') + '.out', out.join('\n') + '\n');
})().catch(e => { console.error(e); fs.writeFileSync('typed.out', out.join('\n') + '\nCRASH ' + e.stack); process.exit(1); });
