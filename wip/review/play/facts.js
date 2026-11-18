// Facts check: the app's own data (taken from the running page) against world-countries (npm) and usa-states.
'use strict';
const fs = require('fs');
const L = require('./lib.js');
const wc = require('./ext/node_modules/world-countries');
const { UsaStates } = require('./ext/node_modules/usa-states');
const cl = require('./ext/node_modules/countries-list');
const fold = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const out = [];
const say = (...a) => { out.push(a.join(' ')); };

(async () => {
  const s = await L.open();
  await L.home(s);
  const app = await s.page.evaluate(() => {
    const a = window.__atlas;
    const lv = k => a.levelByKey(k).names();
    const conts = { 'Africa': 'africa', 'Asia': 'asia', 'Europe': 'europe', 'North America': 'north-america', 'South America': 'south-america', 'Oceania': 'oceania' };
    const byCont = {};
    Object.keys(conts).forEach(c => { byCont[c] = lv(conts[c]); });
    const quizLevels = {};
    a.LEVELS.filter(l => ['capital-pick', 'capital-find', 'flag', 'name-it'].indexOf(l.mode) !== -1).forEach(l => { quizLevels[l.key] = l.names(); });
    const flags = {};
    Object.keys(a.WORLD_FACTS).forEach(n => { flags[n] = { emoji: a.Quiz.flagEmoji(a.WORLD_FACTS[n][1]), has: a.Quiz.hasFlag ? a.Quiz.hasFlag(n, a.WORLD_FACTS) : null }; });
    return { facts: a.WORLD_FACTS, aliases: a.COUNTRY_TYPED_ALIASES, world: lv('world'), byCont, quizLevels, flags,
      noGlyph: a.Quiz.FLAG_NO_GLYPH, stale: a.Quiz.FLAG_STALE,
      capOwners: (function () { const o = {}; Object.keys(a.WORLD_FACTS).forEach(n => { try { o[n] = a.Quiz.capitalPrompt(n, a.WORLD_FACTS); } catch (e) { o[n] = 'ERR ' + e.message; } }); return o; })() };
  });
  fs.writeFileSync('facts-app.json', JSON.stringify(app, null, 1));

  // ---- 1. countries: every app country has facts; ISO code maps to the same country in world-countries
  const byCca2 = new Map(wc.map(c => [c.cca2, c]));
  const names = Object.keys(app.facts);
  say('countries in WORLD_FACTS:', names.length, ' world level:', app.world.length);
  app.world.forEach(n => { if (!app.facts[n]) say('NO FACTS for world-level country', n); });
  names.forEach(n => { if (app.world.indexOf(n) === -1) say('facts for a name not in the world level:', n); });
  const seenIso = new Map();
  const regionOf = c => c.region === 'Americas' ? (c.subregion === 'South America' ? 'South America' : 'North America') : c.region;
  const contOf = {};
  Object.keys(app.byCont).forEach(c => app.byCont[c].forEach(n => { if (contOf[n]) say('IN TWO CONTINENTS', n); contOf[n] = c; }));
  names.forEach(n => {
    const [cap, iso, alts] = app.facts[n];
    if (seenIso.has(iso)) say('DUPLICATE ISO', iso, n, seenIso.get(iso));
    seenIso.set(iso, n);
    const c = byCca2.get(iso);
    if (!c) { say('ISO not in world-countries:', n, iso, 'capital', cap); return; }
    // name agreement
    const their = [c.name.common, c.name.official].concat(c.altSpellings || []).map(fold);
    const mine = [n].concat(app.aliases[n] || []).map(fold);
    if (!mine.some(m => their.indexOf(m) !== -1)) say('NAME?', n, iso, '-> world-countries calls', iso, c.name.common, '/', c.name.official);
    // capital
    const theirCaps = (c.capital || []).map(fold);
    const clCap = cl.countries[iso] ? fold(cl.countries[iso].capital) : '';
    const myCaps = [cap].concat(alts || []).map(fold);
    if (theirCaps.indexOf(fold(cap)) === -1) {
      say('CAPITAL differs:', n, '| app shows', JSON.stringify(cap), 'accepts', JSON.stringify(alts || []), '| world-countries', JSON.stringify(c.capital), '| countries-list', JSON.stringify(cl.countries[iso] && cl.countries[iso].capital));
    }
    theirCaps.forEach(t => { if (myCaps.indexOf(t) === -1) say('capital in world-countries not accepted by app:', n, JSON.stringify(c.capital), 'app', JSON.stringify([cap].concat(alts || []))); });
    (alts || []).forEach(a => { if (theirCaps.indexOf(fold(a)) === -1) say('app alternate capital not in world-countries:', n, a, '(wc', JSON.stringify(c.capital) + ')'); });
    // continent
    if (contOf[n] !== regionOf(c)) say('CONTINENT differs:', n, '| app', contOf[n], '| world-countries', c.region + '/' + c.subregion);
    // flag emoji = regional indicators of the ISO code
    const want = c.flag;
    if (app.flags[n].emoji !== want) say('FLAG emoji differs:', n, iso, JSON.stringify(app.flags[n].emoji), 'vs', JSON.stringify(want));
  });
  // sovereign states in world-countries that the app does not have
  const appIso = new Set(names.map(n => app.facts[n][1]));
  say('UN members / independent states in world-countries missing from the app:',
    wc.filter(c => c.independent && c.unMember && !appIso.has(c.cca2)).map(c => c.name.common).join(', '));
  say('app entries that are not UN members in world-countries:',
    names.filter(n => { const c = byCca2.get(app.facts[n][1]); return !c || !c.unMember; }).join(', '));
  say('flag no-glyph list:', JSON.stringify(app.noGlyph), ' stale:', JSON.stringify(app.stale));
  // quiz levels: which countries are left out of which
  Object.keys(app.quizLevels).forEach(k => {
    const m = k.match(/^(capitals-find|capitals|flags|name)-(.*)$/);
    const base = m[2] === 'world' ? app.world : app.byCont[{ 'africa': 'Africa', 'asia': 'Asia', 'europe': 'Europe', 'north-america': 'North America', 'south-america': 'South America', 'oceania': 'Oceania' }[m[2]]];
    const have = new Set(app.quizLevels[k]);
    const left = base.filter(n => !have.has(n));
    const extra = app.quizLevels[k].filter(n => base.indexOf(n) === -1);
    if (left.length || extra.length) say('level', k, 'leaves out:', left.join(', ') || '-', ' extra:', extra.join(', ') || '-');
  });
  // shared capitals
  const capMap = new Map();
  names.forEach(n => [app.facts[n][0]].concat(app.facts[n][2] || []).forEach(c => { const f = fold(c); capMap.set(f, (capMap.get(f) || []).concat(n)); }));
  capMap.forEach((v, k) => { if (v.length > 1) say('capital shared by:', k, '->', v.join(', ')); });

  // ---- 2. US state capitals
  const html = fs.readFileSync('/home/user/atlas-game/public/index.html', 'utf8');
  const blk = html.slice(html.indexOf('const US_CAPITALS = {'), html.indexOf('};', html.indexOf('const US_CAPITALS = {')));
  const usApp = {};
  blk.replace(/'([^']+)':\s*'([^']+)'/g, (m, a, b) => { usApp[a] = b; });
  const us = new UsaStates().states;
  say('US states in app table:', Object.keys(usApp).length);
  us.forEach(st => {
    if (st.name === 'District of Columbia') return;
    if (!usApp[st.name]) say('US state missing in app:', st.name);
    else if (fold(usApp[st.name]) !== fold(st.capital)) say('US CAPITAL differs:', st.name, 'app', usApp[st.name], 'usa-states', st.capital);
  });
  Object.keys(usApp).forEach(n => { if (!us.find(st => st.name === n)) say('app US state not in usa-states:', n); });

  // ---- 3. typed names through the page's Quiz module
  const typed = await s.page.evaluate(args => {
    const a = window.__atlas, Q = a.Quiz, res = [];
    const all = Object.keys(a.WORLD_FACTS);
    const list = Q.entries(all, a.COUNTRY_TYPED_ALIASES);
    const levels = {};
    a.LEVELS.filter(l => l.mode === 'name-it').forEach(l => { levels[l.key] = l.names(); });
    const matchers = {};
    Object.keys(levels).forEach(k => { matchers[k] = Q.matcher(list, { restrictTo: levels[k].slice() }); });
    const home = {};
    Object.keys(levels).forEach(k => { if (k !== 'name-world') levels[k].forEach(n => { home[n] = k; }); });
    let checked = 0;
    all.forEach(name => {
      const spellings = [name].concat(a.COUNTRY_TYPED_ALIASES[name] || []);
      spellings.forEach(sp => {
        [sp, sp.toUpperCase(), '  ' + sp + ' '].forEach(text => {
          Object.keys(matchers).forEach(k => {
            checked++;
            const r = matchers[k].match(text);
            const inLevel = levels[k].indexOf(name) !== -1;
            if (inLevel) {
              if (!r || r.name !== name || !r.exact) res.push('IN-LEVEL FAIL ' + k + ' "' + text + '" for ' + name + ' -> ' + JSON.stringify(r));
            } else {
              if (r && r.name !== name) res.push('WRONG COUNTRY ' + k + ' "' + text + '" for ' + name + ' -> ' + JSON.stringify(r));
              else if (r && !r.outside) res.push('ACCEPTED OUTSIDE LEVEL ' + k + ' "' + text + '" -> ' + JSON.stringify(r));
              else if (!r) res.push('outside name not recognised ' + k + ' "' + text + '" for ' + name);
            }
          });
        });
      });
      if (!home[name]) res.push('country in no continent Name It level: ' + name);
    });
    // independent names: every spelling world-countries has for each country
    const world = matchers['name-world'];
    const isoOf = {}; all.forEach(n => { isoOf[n] = a.WORLD_FACTS[n][1]; });
    const ext = [];
    args.wc.forEach(c => {
      c.names.forEach(t => {
        const r = world.match(t);
        if (!r) { if (c.inApp && c.primary.indexOf(t) !== -1) ext.push('not accepted: "' + t + '" (' + c.cca2 + ')'); return; }
        if (isoOf[r.name] !== c.cca2) ext.push('WRONG: "' + t + '" is ' + c.common + ' (' + c.cca2 + ') in world-countries, the app takes it as ' + r.name + ' ' + JSON.stringify(r));
      });
    });
    return { res, ext, checked };
  }, { wc: wc.map(c => {
    const natives = Object.keys(c.name.native || {}).map(k => [c.name.native[k].common, c.name.native[k].official]).flat();
    const trans = Object.keys(c.translations || {}).map(k => [c.translations[k].common, c.translations[k].official]).flat();
    const codes = [c.cca2, c.cca3, c.cioc].filter(Boolean);
    const primary = [c.name.common, c.name.official];
    return { cca2: c.cca2, common: c.name.common, inApp: appIso.has(c.cca2), primary,
      names: Array.from(new Set(primary.concat(c.altSpellings || [], natives, trans, codes, c.capital || []))).filter(t => typeof t === 'string' && t.length && t.length <= 60) };
  }) });
  say('typed-name checks run:', typed.checked);
  typed.res.forEach(r => say('TYPED', r));
  typed.ext.forEach(r => say('EXT', r));
  await s.close();
  fs.writeFileSync('facts.out', out.join('\n') + '\n');
  console.log('lines', out.length, 'errors', s.errors.length);
})().catch(e => { console.error(e); fs.writeFileSync('facts.out', out.join('\n') + '\nCRASH ' + e.stack); process.exit(1); });
