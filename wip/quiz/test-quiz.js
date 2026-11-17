// Tests for quiz.js. Run: node test-quiz.js   (prints PASS/FAIL per check, exits non-zero on failure)
// Options: --quick (smaller samples), --verbose (print every judged input).
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const QUIZ_PATH = path.join(__dirname, 'quiz.js');
const SRC = fs.readFileSync(QUIZ_PATH, 'utf8');
const Quiz = require(QUIZ_PATH);
const { WORLD_FACTS: FACTS, COUNTRY_TYPED_ALIASES: ALIASES, CONTINENTS } = require('./load-data.js');

const QUICK = process.argv.includes('--quick');
const VERBOSE = process.argv.includes('--verbose');
const COUNTRIES = Object.keys(FACTS);
const ALL_NAMES = [].concat(...Object.keys(CONTINENTS).map(k => CONTINENTS[k]));

let passed = 0, failed = 0;
function check(name, ok, detail) {
  if (ok) passed++; else failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
}
// Runs a block of asserts as one check; the first failing assert becomes the detail.
function group(name, fn) {
  try { const detail = fn(); check(name, true, detail); } catch (e) { check(name, false, e.message.split('\n')[0]); }
}
function info(line) { console.log('     ' + line); }
function show(v) { return JSON.stringify(v); }
// A separate copy of the module, for tests that need its load-time state untouched.
function freshQuiz(globals) {
  const ctx = vm.createContext(globals || {});
  vm.runInContext(SRC.replace(/^const Quiz = /m, 'var Quiz = '), ctx);
  return ctx.Quiz;
}

const fold = Quiz.fold;
const ENTRIES = Quiz.entries(COUNTRIES, ALIASES);
const M = Quiz.matcher(ENTRIES);
// [folded spelling, country, raw spelling]
const SPELLINGS = [];
{
  const seen = new Set();
  for (const c of COUNTRIES) {
    for (const raw of [c].concat(ALIASES[c] || [])) {
      const f = fold(raw);
      if (!seen.has(f)) { seen.add(f); SPELLINGS.push([f, c, raw]); }
    }
  }
}
const OWNER = new Map(SPELLINGS.map(s => [s[0], s[1]]));

/* ===== 0. The file itself ===== */
group('file: banner first line, END marker last line, ASCII only, loads without DOM or globals', () => {
  const lines = SRC.replace(/\n$/, '').split('\n');
  assert(/^\/\* ===== QUIZ LOGIC \(quiz\.js\)/.test(lines[0]) && /\*\/$/.test(lines[0]), 'first line is not the banner comment');
  assert.strictEqual(lines[lines.length - 1], '/* ===== END QUIZ LOGIC (quiz.js) ===== */');
  assert(!/[^\x00-\x7f]/.test(SRC), 'non-ASCII byte in quiz.js');
  assert(!/\r/.test(SRC), 'carriage return in quiz.js');
  assert(/'use strict';/.test(SRC));
  assert(!/\b(require|import|window|localStorage|navigator)\b/.test(SRC), 'reads a global it should not');
  // An empty realm: no document, no window, no module.
  const q = freshQuiz({});
  assert.strictEqual(q.fold('  Côte d’Ivoire '), 'cote divoire');
  // Pasted inside the game's own strict IIFE.
  const pasted = new Function('"use strict"; return (function () {\n' + SRC + '\nreturn Quiz; })();')();
  assert.strictEqual(pasted.fold('St. Lucia'), 'saint lucia');
  assert(Object.isFrozen(Quiz));
  return lines.length + ' lines, ' + SRC.length + ' bytes';
});

group('file: an engine without Unicode property escapes still folds Latin text', () => {
  const Real = RegExp;
  function Old(src, flags) { if (/u/.test(flags || '')) throw new SyntaxError('no u flag'); return new Real(src, flags); }
  const q = freshQuiz({ RegExp: Old });
  assert.strictEqual(q.fold('  Côte d’Ivoire '), 'cote divoire');
  assert.strictEqual(q.fold('St. Kitts & Nevis'), 'saint kitts and nevis');
  assert.strictEqual(q.fold('Guinea–Bissau'), 'guinea bissau');
  assert.strictEqual(q.fold('The  Gambia!'), 'gambia');
  const m = q.matcher(q.entries(COUNTRIES, ALIASES));
  for (const [f, c, raw] of SPELLINGS) assert.strictEqual(m.match(raw).name, c, raw);
});

/* ===== 1. fold ===== */
group('fold: spec examples', () => {
  const cases = [
    ['France', 'france'], ['  FRANCE  ', 'france'], ['Côte d’Ivoire', 'cote divoire'], ["Cote d'Ivoire", 'cote divoire'],
    ['São Tomé & Príncipe', 'sao tome and principe'], ['Antigua&Barbuda', 'antigua and barbuda'],
    ['St Lucia', 'saint lucia'], ['St. Lucia', 'saint lucia'], ['St.Lucia', 'saint lucia'], ['ST. LUCIA.', 'saint lucia'],
    ['Port St. Johns', 'port saint johns'], ['Stockholm', 'stockholm'], ['East', 'east'], ['Best Place', 'best place'],
    ['Guinea-Bissau', 'guinea bissau'], ['Guinea–Bissau', 'guinea bissau'], ['Guinea‑Bissau', 'guinea bissau'],
    ['Timor−Leste', 'timor leste'], ['Bosnia/Herzegovina', 'bosnia herzegovina'], ['north_korea', 'north korea'],
    ['The Gambia', 'gambia'], ['the  Netherlands', 'netherlands'], ['THE the Bahamas', 'bahamas'], ['the', 'the'],
    ['Theodore', 'theodore'], ['Washington, D.C.', 'washington dc'], ["N'Djamena", 'ndjamena'], ['U.S.A.', 'usa'],
    ['Reykjavík', 'reykjavik'], ['Chișinău', 'chisinau'], ['Yaoundé', 'yaounde'], ['Brasília', 'brasilia'],
    ['Straße', 'strasse'], ['Ærø', 'aero'], ['Łódź', 'lodz'], ['Þingvellir', 'thingvellir'], ['Seyðisfjörður', 'seydisfjordur'],
    ['Đà Nẵng', 'da nang'], ['Œuvre', 'oeuvre'], ['Ħamrun', 'hamrun'], ['İstanbul', 'istanbul'], ['ISTANBUL', 'istanbul'],
    ['Diyarbakır', 'diyarbakir'], ['TÜRKİYE', 'turkiye'], ['Hawaiʻi', 'hawaii'], ['Sanaʼa', 'sanaa'], ['Sana`a', 'sanaa'],
    ['\tUnited  States\n', 'united states'], ['New　Zealand', 'new zealand'], ['Fra​nce', 'france'],
    ['Fr­ance', 'france'], ['﻿France', 'france'], ['‏France‎', 'france'], ['ＦＲＡＮＣＥ', 'france'],
    ['𝐅𝐫𝐚𝐧𝐜𝐞', 'france'], ['🇫🇷 France!!', 'france'], ['(Peru)', 'peru'], ['Peru?', 'peru'], ['"Peru"', 'peru'],
    ['', ''], ['   ', ''], ['...', ''], ["'", ''], ['-', ''], ['&', 'and'], ['🇫🇷', ''], ['́́', ''],
    ['st', 'saint'], ['St.', 'saint'], ['the st', 'saint']
  ];
  for (const [input, want] of cases) assert.strictEqual(fold(input), want, show(input));
  for (const bad of [null, undefined, 42, {}, [], true, () => 'x']) assert.strictEqual(fold(bad), '', 'non-string ' + String(bad));
  return cases.length + ' cases';
});

group('fold: idempotent, and only letters, digits and single spaces come out', () => {
  const rnd = Quiz.rng(7);
  const pieces = ['a', 'B', 'é', 'ß', ' ', '  ', '-', '.', "'", '&', 'st', 'St.', 'the ', 'The', 'ø', 'İ', '‏', '🇫🇷', '\t', 'Æ', '_', '/', '1', 'z', 'n', '́', 'я', '日', '’', ',', '(', 'ﬁ', 'Ａ'];
  const inputs = SPELLINGS.map(s => s[2]).concat(COUNTRIES.map(c => FACTS[c][0]));
  for (let i = 0; i < 20000; i++) {
    let s = '';
    for (let k = 0, len = 1 + Math.floor(rnd() * 12); k < len; k++) s += pieces[Math.floor(rnd() * pieces.length)];
    inputs.push(s);
  }
  for (const s of inputs) {
    const f = fold(s);
    assert.strictEqual(fold(f), f, 'not idempotent: ' + show(s) + ' -> ' + show(f) + ' -> ' + show(fold(f)));
    assert(/^(?:[\p{L}\p{N}]+(?: [\p{L}\p{N}]+)*)?$/u.test(f), 'bad output ' + show(f) + ' for ' + show(s));
  }
  for (const s of inputs) if (/^[A-Za-z ]*$/.test(s)) assert.strictEqual(fold(s), fold(s + '\u200b'), 'shortcut differs for ' + show(s));
  for (const s of ['St Lucia', 'the st the', 'THE  Gambia ', ' st ', 'The', 'a  b   c', 'KELVIN \u212a']) assert.strictEqual(fold(s), fold('\u200b' + s), show(s));
  return inputs.length + ' strings';
});

/* ===== 2. Edit distance ===== */
// Textbook Damerau-Levenshtein (Lowrance-Wagner), written apart from the module's version.
function refDistance(a, b) {
  const n = a.length, m = b.length, INF = n + m;
  const H = [];
  for (let i = 0; i <= n + 1; i++) H.push(new Array(m + 2).fill(0));
  H[0][0] = INF;
  for (let i = 0; i <= n; i++) { H[i + 1][0] = INF; H[i + 1][1] = i; }
  for (let j = 0; j <= m; j++) { H[0][j + 1] = INF; H[1][j + 1] = j; }
  const da = new Map();
  for (let i = 1; i <= n; i++) {
    let db = 0;
    for (let j = 1; j <= m; j++) {
      const k = da.get(b[j - 1]) || 0, l = db;
      let cost = 1;
      if (a[i - 1] === b[j - 1]) { cost = 0; db = j; }
      H[i + 1][j + 1] = Math.min(H[i][j] + cost, H[i + 1][j] + 1, H[i][j + 1] + 1, H[k][l] + (i - k - 1) + 1 + (j - l - 1));
    }
    da.set(a[i - 1], i);
  }
  return H[n + 1][m + 1];
}
// Every string one edit away (over the given alphabet).
function oneEdit(s, alphabet) {
  const out = new Set();
  for (let i = 0; i < s.length; i++) out.add(s.slice(0, i) + s.slice(i + 1));
  for (let i = 0; i <= s.length; i++) for (const ch of alphabet) out.add(s.slice(0, i) + ch + s.slice(i));
  for (let i = 0; i < s.length; i++) for (const ch of alphabet) if (ch !== s[i]) out.add(s.slice(0, i) + ch + s.slice(i + 1));
  for (let i = 0; i + 1 < s.length; i++) if (s[i] !== s[i + 1]) out.add(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2));
  out.delete(s);
  return out;
}
group('distance: agrees with a breadth-first search over real edits (short strings, 3 letters)', () => {
  const rnd = Quiz.rng(11);
  const word = () => { let s = ''; for (let k = Math.floor(rnd() * 5); k > 0; k--) s += 'abc'[Math.floor(rnd() * 3)]; return s; };
  let n = 0;
  for (let t = 0; t < (QUICK ? 150 : 600); t++) {
    const a = word(), b = word();
    // BFS: the fewest insertions, deletions, substitutions and neighbour swaps turning a into b.
    let frontier = new Set([a]), seen = new Set([a]), depth = 0;
    while (!frontier.has(b)) {
      const next = new Set();
      for (const s of frontier) for (const v of oneEdit(s, 'abc')) if (v.length <= 6 && !seen.has(v)) { seen.add(v); next.add(v); }
      frontier = next; depth++;
      assert(depth < 8, 'bfs ran away');
    }
    assert.strictEqual(Quiz.distance(a, b), depth, show(a) + ' ' + show(b));
    assert.strictEqual(refDistance(a, b), depth, 'reference: ' + show(a) + ' ' + show(b));
    n++;
  }
  return n + ' pairs';
});
group('distance: agrees with the reference on names and their mutations; symmetric', () => {
  const rnd = Quiz.rng(12);
  let n = 0;
  const words = SPELLINGS.map(s => s[0]);
  for (let t = 0; t < (QUICK ? 5000 : 40000); t++) {
    const a = words[Math.floor(rnd() * words.length)];
    let b = words[Math.floor(rnd() * words.length)];
    if (rnd() < 0.6) { b = a; for (let k = 1 + Math.floor(rnd() * 4); k > 0; k--) { const v = [...oneEdit(b, 'abcdefghijklmnopqrstuvwxyz ')]; b = v[Math.floor(rnd() * v.length)]; } }
    const d = Quiz.distance(a, b);
    assert.strictEqual(d, refDistance(a, b), show(a) + ' ' + show(b));
    assert.strictEqual(d, Quiz.distance(b, a));
    n++;
  }
  assert.strictEqual(Quiz.distance('', ''), 0);
  assert.strictEqual(Quiz.distance('abc', ''), 3);
  assert.strictEqual(Quiz.distance('ca', 'abc'), 2);   // 3 under the restricted (optimal string alignment) variant
  assert.strictEqual(Quiz.distance('nigera', 'nigeria'), 1);
  assert.strictEqual(Quiz.distance('nigera', 'niger'), 1);
  return n + ' pairs';
});

/* ===== 3. Matcher: exact ===== */
group('matcher: every country and every alias matches itself exactly', () => {
  let n = 0;
  for (const c of COUNTRIES) {
    for (const [raw, via] of [[c, 'name']].concat((ALIASES[c] || []).map(a => [a, 'alias']))) {
      for (const text of [raw, raw.toUpperCase(), raw.toLowerCase(), '  ' + raw + '\t', raw.replace(/ /g, '  ')]) {
        const r = M.match(text);
        assert(r && r.name === c && r.exact === true, show(text) + ' -> ' + show(r));
        // An alias that folds to the name itself ("the gambia") reports the name.
        assert.strictEqual(r.via, fold(raw) === fold(c) ? 'name' : via, show(text));
        n++;
      }
    }
  }
  assert.strictEqual(M.size, 185);
  assert.strictEqual(SPELLINGS.length, 185 + Object.keys(ALIASES).reduce((t, k) => t + new Set(ALIASES[k].map(fold).filter(f => f !== fold(k))).size, 0));
  return n + ' inputs, ' + SPELLINGS.length + ' distinct folded spellings';
});

group('matcher: no typed alias is listed under a name missing from the facts table', () => {
  const stray = Object.keys(ALIASES).filter(k => !Object.prototype.hasOwnProperty.call(FACTS, k));
  assert.deepStrictEqual(stray, []);
  assert.deepStrictEqual(ALL_NAMES.filter(n => !Object.prototype.hasOwnProperty.call(FACTS, n)), []);
  assert.deepStrictEqual(COUNTRIES.filter(n => !ALL_NAMES.includes(n)), []);
});

group('matcher: build-time errors for data bugs', () => {
  assert.throws(() => Quiz.matcher([{ name: 'Georgia' }, { name: 'georgia' }]), /share the spelling/);
  assert.throws(() => Quiz.matcher([{ name: 'A Land', aliases: ['b-land'] }, { name: 'B Land' }]), /share the spelling/);
  assert.throws(() => Quiz.matcher([{ name: 'Saint Lucia' }, { name: 'Other', aliases: ['St. Lucia'] }]), /share the spelling/);
  assert.throws(() => Quiz.matcher([{ name: 'Gambia' }, { name: 'Other', aliases: ['The Gambia'] }]), /share the spelling/);
  assert.throws(() => Quiz.matcher([{ name: 'Alpha', aliases: ['...'] }]), /nothing left/);
  assert.throws(() => Quiz.matcher([{ name: '' }]), /nothing left/);
  assert.throws(() => Quiz.matcher([{ aliases: [] }]), TypeError);
  assert.throws(() => Quiz.matcher([{ name: 'Alpha', aliases: [3] }]), TypeError);
  assert.throws(() => Quiz.matcher('nope'), TypeError);
  // The same spelling twice under one entry is fine.
  const m = Quiz.matcher([{ name: 'Gambia', aliases: ['the gambia', 'GAMBIA', 'Gambia'] }, { name: 'Zambia' }]);
  assert.strictEqual(m.match('the Gambia').name, 'Gambia');
  assert.strictEqual(Quiz.matcher([]).match('France'), null);
  // The real tables with one planted clash.
  const bad = Quiz.entries(COUNTRIES, Object.assign({}, ALIASES, { Taiwan: ["People's Republic of China"] }));
  assert.throws(() => Quiz.matcher(bad), /Taiwan.*China|China.*Taiwan/);
});

/* ===== 4. Matcher: reference implementation of the near rule ===== */
const COMPASS = [['north', 'south', 'east', 'west'], ['northern', 'southern', 'eastern', 'western']];
const DECOY_SET = new Set();
for (const d of Quiz.DECOYS) { const f = fold(d); if (f && !OWNER.has(f)) DECOY_SET.add(f); }
for (const [f] of SPELLINGS) {
  const words = f.split(' ');
  if (words.length < 2) continue;
  words.forEach((w, at) => COMPASS.forEach(g => {
    if (!g.includes(w)) return;
    g.forEach(o => { const v = words.map((x, i) => (i === at ? o : x)).join(' '); if (o !== w && !OWNER.has(v)) DECOY_SET.add(v); });
  }));
}
const DECOY_LIST = [...DECOY_SET];
// The rule as specified, computed the slow obvious way. Returns a country name or null.
function refNear(f, dist) {
  const best = new Map();     // country -> { any, six, ten }
  for (const [s, c] of SPELLINGS) {
    if (Math.abs(s.length - f.length) > 3) continue;
    const d = dist(f, s);
    const b = best.get(c) || { any: 99, six: 99, ten: 99 };
    b.any = Math.min(b.any, d);
    if (s.length >= 6) b.six = Math.min(b.six, d);
    if (s.length >= 10) b.ten = Math.min(b.ten, d);
    best.set(c, b);
  }
  let k = 1, cands = [...best].filter(([, b]) => b.six <= 1);
  if (cands.length === 0) { k = 2; cands = [...best].filter(([, b]) => b.ten <= 2); }
  if (cands.length !== 1) return null;
  const winner = cands[0][0];
  for (const [c, b] of best) if (c !== winner && b.any <= k + 1) return null;
  for (const d of DECOY_LIST) if (Math.abs(d.length - f.length) <= k && dist(f, d) <= k) return null;
  for (const [s, c] of SPELLINGS) if (c !== winner && s.length > f.length && s.startsWith(f)) return null;
  return winner;
}
function refMatch(text) {
  if (typeof text !== 'string' || text.length > 60) return null;
  const f = fold(text);
  if (!f) return null;
  if (OWNER.has(f)) return OWNER.get(f);
  if (DECOY_SET.has(f)) return null;
  return refNear(f, refDistance);
}

/* ===== 5. Matcher: exhaustive one-edit variants ===== */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz ';
const accepted1 = [];      // [variant, spelling, country]
const stats1 = { total: 0, near: 0, same: 0, none: 0, otherExact: [], wrong: [] };
for (const [s, c] of SPELLINGS) {
  for (const v of oneEdit(s, ALPHABET)) {
    stats1.total++;
    const r = M.match(v);
    if (!r) stats1.none++;
    else if (r.name === c) { if (r.exact) stats1.same++; else { stats1.near++; accepted1.push([v, s, c]); } }
    else if (r.exact) stats1.otherExact.push(s + ' -> ' + v + ' = ' + r.name);
    else stats1.wrong.push(s + ' -> ' + v + ' resolved to ' + r.name);
  }
}
check('matcher: no one-edit variant of any accepted spelling resolves to a different country', stats1.wrong.length === 0,
  stats1.total + ' variants of ' + SPELLINGS.length + ' spellings: ' + stats1.near + ' accepted as a near match, ' + stats1.same +
  ' fold back to the same country exactly, ' + stats1.none + ' rejected, ' + stats1.otherExact.length +
  ' are another country\'s own spelling' + (stats1.wrong.length ? '; WRONG: ' + stats1.wrong.slice(0, 5).join('; ') : ''));
info('one edit apart and both real spellings (exact match wins, as it must): ' + [...new Set(stats1.otherExact.map(x => x.replace(/ = .*/, '')))].join(', '));
{
  // Acceptance by spelling length, to show who gets forgiveness.
  const by = new Map();
  for (const [s] of SPELLINGS) { const b = by.get(s.length >= 6) || { n: 0, got: 0 }; b.n++; by.set(s.length >= 6, b); }
  const got = new Set(accepted1.map(a => a[1]));
  const never = SPELLINGS.filter(s => s[0].length >= 6 && !got.has(s[0])).map(s => s[0]);
  check('matcher: spellings under 6 letters never get a near match', accepted1.every(a => a[1].length >= 6));
  info(never.length + ' spellings of 6+ letters accept NO one-edit typo at all (a neighbour is always within 2): ' + never.join(', '));
  const per = new Map();
  for (const [s] of SPELLINGS) if (s.length >= 6) per.set(s, [0, oneEdit(s, ALPHABET).size]);
  for (const a of accepted1) per.get(a[1])[0]++;
  const rates = [...per].map(([s, [a, t]]) => [a / t, s]).sort((x, y) => x[0] - y[0]);
  info('share of one-edit typos accepted, country NAMES of 6+ letters, lowest 25: ' +
    rates.filter(r => COUNTRIES.some(c => fold(c) === r[1])).slice(0, 25).map(r => r[1] + ' ' + Math.round(r[0] * 100) + '%').join(', '));
  const names6 = rates.filter(r => COUNTRIES.some(c => fold(c) === r[1]));
  info('median share accepted over those ' + names6.length + ' names: ' + Math.round(names6[Math.floor(names6.length / 2)][0] * 100) + '%');
}

/* ===== 6. Matcher: two-edit variants (sample) ===== */
const accepted2 = [];
const stats2 = { total: 0, near: 0, same: 0, none: 0, otherExact: 0, wrong: [] };
{
  const rnd = Quiz.rng(2026);
  const per = QUICK ? 60 : 500;
  for (const [s, c] of SPELLINGS) {
    const seen = new Set();
    for (let t = 0; t < per; t++) {
      const first = [...oneEdit(s, ALPHABET)];
      const mid = first[Math.floor(rnd() * first.length)];
      const second = [...oneEdit(mid, ALPHABET)];
      const v = second[Math.floor(rnd() * second.length)];
      if (v === s || seen.has(v)) continue;
      seen.add(v);
      stats2.total++;
      const r = M.match(v);
      if (!r) stats2.none++;
      else if (r.name === c) { if (r.exact) stats2.same++; else { stats2.near++; accepted2.push([v, s, c]); } }
      else if (r.exact) stats2.otherExact++;
      else stats2.wrong.push(s + ' -> ' + v + ' resolved to ' + r.name);
    }
  }
}
check('matcher: no two-edit variant resolves to a different country (sample)', stats2.wrong.length === 0,
  stats2.total + ' variants: ' + stats2.near + ' accepted as a near match, ' + stats2.same + ' exact same, ' + stats2.none + ' rejected, ' +
  stats2.otherExact + ' another country\'s own spelling' + (stats2.wrong.length ? '; WRONG: ' + stats2.wrong.slice(0, 5).join('; ') : ''));
{
  const lawful = ([v, , c]) => {
    const f = fold(v);
    return SPELLINGS.some(s => s[1] === c && ((s[0].length >= 6 && Quiz.distance(f, s[0]) <= 1) || (s[0].length >= 10 && Quiz.distance(f, s[0]) === 2)));
  };
  const unlawful = accepted1.concat(accepted2).filter(a => !lawful(a));
  check('matcher: every accepted near match is 1 edit from a 6+ letter spelling or 2 edits from a 10+ letter spelling of that country', unlawful.length === 0,
    (accepted1.length + accepted2.length) + ' accepted variants' + (unlawful.length ? '; e.g. ' + unlawful.slice(0, 5).map(a => a[0] + '→' + a[2]).join('; ') : ''));
}

/* ===== 7. Matcher against the reference rule ===== */
{
  const rnd = Quiz.rng(99);
  const sample = [];
  const pool1 = [];
  for (const [s] of SPELLINGS) for (const v of oneEdit(s, ALPHABET)) pool1.push(v);
  for (let i = 0; i < (QUICK ? 1500 : 9000); i++) sample.push(pool1[Math.floor(rnd() * pool1.length)]);
  for (const a of accepted1) if (rnd() < (QUICK ? 0.01 : 0.05)) sample.push(a[0]);
  for (const a of accepted2) if (rnd() < (QUICK ? 0.05 : 0.2)) sample.push(a[0]);
  let diff = [];
  for (const v of sample) {
    const r = M.match(v), want = refMatch(v);
    if ((r ? r.name : null) !== want) diff.push(show(v) + ': module ' + show(r) + ', reference ' + show(want));
  }
  check('matcher: agrees with a slow reference implementation of the rule', diff.length === 0, sample.length + ' inputs' + (diff.length ? '; ' + diff.slice(0, 5).join('; ') : ''));
}

/* ===== 8. Typing a name one key at a time ===== */
group('matcher: while a name is being typed, no prefix is taken for another country without the partial flag', () => {
  let nearOnPrefix = 0, partials = new Set();
  for (const [f, c, raw] of SPELLINGS) {
    for (let k = 1; k < raw.length; k++) {
      const p = raw.slice(0, k);
      const r = M.match(p);
      if (!r) continue;
      if (r.name === c) { if (!r.exact) nearOnPrefix++; continue; }
      assert(r.exact === true && r.partial === true, 'typing ' + show(raw) + ', at ' + show(p) + ' got ' + show(r));
      partials.add(fold(p) + ' (' + r.name + ') while typing ' + c);
    }
  }
  // And the flag is not set when nothing longer starts that way.
  for (const [f, c, raw] of SPELLINGS) {
    const r = M.match(raw);
    const longer = SPELLINGS.some(s => s[1] !== c && s[0].length > f.length && s[0].startsWith(f));
    assert.strictEqual(!!r.partial, longer, raw);
  }
  info('exact names that are the start of another country\'s name: ' + [...new Set([...partials].map(p => p.replace(/ while typing.*/, '')))].join(', '));
  return nearOnPrefix + ' prefixes near-match their own country early; ' + partials.size + ' prefix/other-country pairs carry partial';
});

/* ===== 9. What a real player types ===== */
// [input, expected]: a name = must resolve to it; null = must resolve to nothing;
// [name] = a misspelling of that country: resolving to it or to nothing is fine, anything else fails.
const TYPED = [
  // Spec examples
  ['nigera', null], ['austrlia', null], ['Niger', 'Niger'], ['Nigeria', 'Nigeria'], ['nigeri', null], ['nigerai', ['Nigeria']], ['nigeriaa', ['Nigeria']],
  // The Guineas
  ['Guinea', 'Guinea'], ['Guinea-Bissau', 'Guinea-Bissau'], ['guinea bissau', 'Guinea-Bissau'], ['guineabissau', ['Guinea-Bissau']], ['Guinea Bisau', ['Guinea-Bissau']],
  ['Equatorial Guinea', 'Equatorial Guinea'], ['equitorial guinea', ['Equatorial Guinea']], ['Papua New Guinea', 'Papua New Guinea'], ['png', 'Papua New Guinea'],
  ['papa new guinea', ['Papua New Guinea']], ['new guinea', null], ['guinee', ['Guinea']], ['guiana', null], ['Guyana', 'Guyana'], ['guyanna', ['Guyana']], ['Ghana', 'Ghana'],
  ['French Guiana', 'French Guiana'], ['french guyana', ['French Guiana']], ['guine', null],
  // The Congos
  ['Congo', null], ['the congo', null], ['kongo', null], ['DR Congo', 'Democratic Republic of the Congo'], ['D.R. Congo', 'Democratic Republic of the Congo'],
  ['DRC', 'Democratic Republic of the Congo'], ['D.R.C.', 'Democratic Republic of the Congo'], ['Democratic Republic of Congo', 'Democratic Republic of the Congo'],
  ['Congo-Kinshasa', 'Democratic Republic of the Congo'], ['Republic of the Congo', 'Republic of the Congo'], ['republic of congo', 'Republic of the Congo'],
  ['Congo-Brazzaville', 'Republic of the Congo'], ['congo republic', null], ['zaire', null], ['dr kongo', ['Democratic Republic of the Congo']],
  ['democratic republic of the cong', ['Democratic Republic of the Congo']], ['republic of the conga', ['Republic of the Congo']], ['democratic congo', null],
  // Dominica / Dominican Republic
  ['Dominica', 'Dominica'], ['Dominican Republic', 'Dominican Republic'], ['dominican', null], ['dominic', null], ['dominican rep', null], ['DR', null],
  ['dominica republic', ['Dominican Republic']], ['domenica', ['Dominica']], ['dominicana', null], ['the dominican republic', 'Dominican Republic'],
  // Austria / Australia
  ['Austria', 'Austria'], ['Australia', 'Australia'], ['austrailia', ['Australia']], ['australa', ['Australia']], ['ausralia', ['Australia']], ['austra', null],
  ['austraia', null], ['ostralia', ['Australia']], ['austira', ['Austria']], ['australasia', null], ['austrian', ['Austria']],
  // Iran / Iraq
  ['Iran', 'Iran'], ['Iraq', 'Iraq'], ['irak', null], ['irann', null], ['irn', null], ['ira', null], ['iraqq', null], ['İran', 'Iran'], ['persia', null],
  // Slovakia / Slovenia
  ['Slovakia', 'Slovakia'], ['Slovenia', 'Slovenia'], ['slovania', null], ['slovakai', ['Slovakia']], ['slovenija', ['Slovenia']], ['slowakia', ['Slovakia']],
  ['slovak republic', 'Slovakia'], ['slovak', null], ['slavonia', null], ['slovnia', ['Slovenia']],
  // Gambia / Zambia
  ['Gambia', 'Gambia'], ['Zambia', 'Zambia'], ['The Gambia', 'Gambia'], ['bambia', null], ['gambiaa', ['Gambia']], ['zambai', ['Zambia']], ['nambia', null], ['namibia', 'Namibia'],
  // Mali / Malawi / Malta
  ['Mali', 'Mali'], ['Malawi', 'Malawi'], ['Malta', null], ['malwi', null], ['malai', null], ['malawy', ['Malawi']], ['malawai', ['Malawi']], ['maly', null],
  ['malaya', null], ['Malaysia', 'Malaysia'], ['malasia', ['Malaysia']], ['maldives', null], ['mallawi', ['Malawi']],
  // Sudan / South Sudan
  ['Sudan', 'Sudan'], ['South Sudan', 'South Sudan'], ['north sudan', null], ['noth sudan', null], ['s sudan', null], ['southsudan', ['South Sudan']],
  ['south sudn', ['South Sudan']], ['soth sudan', ['South Sudan']], ['sudan south', null], ['soudan', ['Sudan']], ['the sudan', 'Sudan'], ['southern sudan', null],
  // The Koreas
  ['North Korea', 'North Korea'], ['South Korea', 'South Korea'], ['Korea', null], ['dprk', 'North Korea'], ['rok', 'South Korea'], ['Republic of Korea', 'South Korea'],
  ["Democratic People's Republic of Korea", 'North Korea'], ['n korea', null], ['s. korea', null], ['north koria', ['North Korea']], ['souht korea', ['South Korea']],
  ['sorth korea', null], ['nouth korea', null], ['east korea', null], ['west korea', null], ['northkorea', ['North Korea']], ['korea north', null], ['koreas', null],
  // Ireland / Iceland
  ['Ireland', 'Ireland'], ['Iceland', 'Iceland'], ['irland', ['Ireland']], ['icland', ['Iceland']], ['ireland ', 'Ireland'], ['Éire', 'Ireland'], ['island', null],
  ['northern ireland', null], ['irceland', null], ['iseland', ['Iceland']],
  // Latvia / Lithuania
  ['Latvia', 'Latvia'], ['Lithuania', 'Lithuania'], ['lativa', ['Latvia']], ['lithuana', ['Lithuania']], ['lituania', ['Lithuania']], ['latvija', ['Latvia']],
  // Libya / Liberia
  ['Libya', 'Libya'], ['Liberia', 'Liberia'], ['lybia', ['Libya']], ['liberya', ['Liberia']], ['siberia', null], ['iberia', null], ['libia', null], ['libera', ['Liberia']],
  // Mauritius / Mauritania
  ['Mauritius', 'Mauritius'], ['Mauritania', 'Mauritania'], ['mauritus', ['Mauritius']], ['mauritana', ['Mauritania']], ['mauretania', ['Mauritania']], ['mauritia', null],
  ['mauritias', ['Mauritius']], ['maurita', null],
  // Paraguay / Uruguay
  ['Paraguay', 'Paraguay'], ['Uruguay', 'Uruguay'], ['paraguy', ['Paraguay']], ['urugay', ['Uruguay']], ['uraguay', ['Uruguay']], ['paruguay', ['Paraguay']], ['uruguai', ['Uruguay']],
  // India / Indonesia
  ['India', 'India'], ['Indonesia', 'Indonesia'], ['indonisia', ['Indonesia']], ['inda', null], ['indai', null], ['indiana', null], ['indonesa', ['Indonesia']], ['indo', null],
  ['indochina', null], ['micronesia', null], ['polynesia', null],
  // Chad / Chile / China
  ['Chad', 'Chad'], ['Chile', 'Chile'], ['China', 'China'], ['chna', null], ['chili', ['Chile']], ['chilie', ['Chile']], ['chian', null], ['tchad', ['Chad']], ['chine', null],
  ['chilly', ['Chile']], ['chia', null], ['prc', 'China'], ['drc', 'Democratic Republic of the Congo'], ['Republic of China', null], ['roc', null],
  ["People's Republic of China", 'China'], ['peoples republic of chin', ['China']],
  // Other neighbours and classic slips
  ['Tunisia', 'Tunisia'], ['tunis', null], ['Algeria', 'Algeria'], ['algiers', null], ['Swaziland', 'Eswatini'], ['Switzerland', 'Switzerland'], ['swizerland', ['Switzerland']],
  ['swazerland', null], ['Sweden', 'Sweden'], ['Romania', 'Romania'], ['rumania', ['Romania']], ['Armenia', 'Armenia'], ['Albania', 'Albania'], ['alabama', null],
  ['Georgia', 'Georgia'], ['ruanda', ['Rwanda']], ['Colombia', 'Colombia'], ['columbia', ['Colombia']], ['colombo', null], ['Grenada', 'Grenada'], ['granada', ['Grenada']],
  ['grenadines', null], ['moldavia', null], ['Monaco', null], ['morroco', ['Morocco']], ['moroco', ['Morocco']], ['Turkey', 'Turkey'], ['Türkiye', 'Turkey'],
  ['TÜRKİYE', 'Turkey'], ['turky', ['Turkey']], ['Turkmenistan', 'Turkmenistan'], ['turkestan', null], ['tajikstan', ['Tajikistan']], ['kirgizstan', ['Kyrgyzstan']],
  ['kyrgistan', ['Kyrgyzstan']], ['kazakstan', ['Kazakhstan']], ['afganistan', ['Afghanistan']], ['kurdistan', null], ['bangladesch', ['Bangladesh']],
  ['srilanka', ['Sri Lanka']], ['shri lanka', ['Sri Lanka']], ['ceylon', null], ['tailand', ['Thailand']], ['thiland', ['Thailand']], ['phillipines', ['Philippines']],
  ['philipines', ['Philippines']], ['filipines', ['Philippines']], ['The Philippines', 'Philippines'], ['west timor', null], ['East Timor', 'Timor-Leste'],
  ['est timor', null], ['timor', null], ['tiawan', ['Taiwan']], ['south america', null], ['south amrica', null], ['north africa', null], ['South Africa', 'South Africa'],
  ['south afrika', ['South Africa']], ['southafrica', ['South Africa']], ['central africa', null], ['central africa republic', ['Central African Republic']],
  ['south cyprus', null], ['southern cyprus', null], ['North Cyprus', 'Northern Cyprus'], ['Cyprus', 'Cyprus'], ['cypress', ['Cyprus']], ['eastern sahara', null],
  ['Western Sahara', 'Western Sahara'], ['sahara', null], ['south macedonia', null], ['Macedonia', 'North Macedonia'], ['prussia', null], ['rusia', ['Russia']],
  ['russa', ['Russia']], ['Russian Federation', 'Russia'], ['ussr', null], ['soviet union', null], ['england', null], ['scotland', null], ['Great Britain', 'United Kingdom'],
  ['great britian', ['United Kingdom']], ['brittany', null], ['UK', 'United Kingdom'], ['U.K.', 'United Kingdom'], ['untied kingdom', ['United Kingdom']],
  ['united kindom', ['United Kingdom']], ['unitedkingdom', ['United Kingdom']], ['united', null], ['united nations', null], ['USA', 'United States'], ['U.S.A.', 'United States'],
  ['U.S.', 'United States'], ['us', 'United States'], ['America', 'United States'], ['americas', null], ['north america', null], ['United States of America', 'United States'],
  ['unites states', ['United States']], ['united state', ['United States']], ['unitedstates', ['United States']], ['UAE', 'United Arab Emirates'],
  ['united arab emirate', ['United Arab Emirates']], ['united arab republic', null], ['holland', 'Netherlands'], ['hollande', ['Netherlands']], ['polland', null],
  ['netherland', ['Netherlands']], ['neverland', null], ['bahama', ['Bahamas']], ['panama', 'Panama'], ['tahiti', null], ['Haiti', 'Haiti'], ['hati', ['Haiti']],
  ['salvador', null], ['san salvador', null], ['el salvadore', ['El Salvador']], ['costa rico', ['Costa Rica']], ['puerto rico', null], ['santa lucia', ['Saint Lucia']],
  ['tanzania', 'Tanzania'], ['tasmania', null], ['zanzibar', null], ['oman', 'Oman'], ['roman', null], ['olivia', ['Bolivia']], ['angora', ['Angola']], ['hungry', ['Hungary']],
  // A child's phonetic spellings
  ['jermany', ['Germany']], ['frans', ['France']], ['spane', ['Spain']], ['itly', ['Italy']], ['ejipt', ['Egypt']], ['egipt', ['Egypt']], ['meksiko', ['Mexico']],
  ['kanada', ['Canada']], ['brazill', ['Brazil']], ['brasil', ['Brazil']], ['portagul', ['Portugal']], ['swedin', ['Sweden']], ['norwey', ['Norway']], ['finlend', ['Finland']],
  ['polend', ['Poland']], ['grees', ['Greece']], ['greese', ['Greece']], ['rusha', ['Russia']], ['ukrane', ['Ukraine']], ['jamayca', ['Jamaica']], ['cuber', ['Cuba']],
  ['venezwela', ['Venezuela']], ['argentena', ['Argentina']], ['perru', ['Peru']], ['kenia', ['Kenya']], ['ethiopea', ['Ethiopia']], ['madagaskar', ['Madagascar']],
  ['zimbabway', ['Zimbabwe']], ['moroko', ['Morocco']], ['saudia arabia', ['Saudi Arabia']], ['isreal', ['Israel']], ['new zeland', ['New Zealand']],
  ['new zeeland', ['New Zealand']], ['newzealand', ['New Zealand']], ['fidji', ['Fiji']], ['ostria', ['Austria']], ['belgum', ['Belgium']], ['denmarc', ['Denmark']],
  ['luxemburg', ['Luxembourg']], ['lichtenstein', null], ['checkia', ['Czech Republic']], ['czeck republic', ['Czech Republic']], ['icelend', ['Iceland']],
  ['yoogoslavia', null], ['venzuela', ['Venezuela']], ['equador', ['Ecuador']], ['hondurus', ['Honduras']], ['guatamala', ['Guatemala']], ['nicuragua', ['Nicaragua']],
  ['camaroon', ['Cameroon']], ['kameroon', ['Cameroon']], ['senagal', ['Senegal']], ['gana', ['Ghana']], ['ugunda', ['Uganda']], ['mozambeek', ['Mozambique']],
  ['katar', ['Qatar']], ['quatar', ['Qatar']], ['kuwate', ['Kuwait']], ['pakistahn', ['Pakistan']], ['nepaul', ['Nepal']], ['butan', ['Bhutan']], ['veitnam', ['Vietnam']],
  ['cambodja', ['Cambodia']], ['mongolea', ['Mongolia']], ['japen', ['Japan']],
  // Keyboard slips: a neighbouring key, a doubled, dropped or swapped letter, a stuck space
  ['feance', ['France']], ['grrmany', ['Germany']], ['gemrany', ['Germany']], ['germanyy', ['Germany']], ['germnay', ['Germany']], ['spaim', ['Spain']], ['itsly', ['Italy']],
  ['brazik', ['Brazil']], ['cabada', ['Canada']], ['mexixo', ['Mexico']], ['jaoan', ['Japan']], ['porrugal', ['Portugal']], ['netherlanss', ['Netherlands']],
  ['belgiun', ['Belgium']], ['denmatk', ['Denmark']], ['hungart', ['Hungary']], ['ukriane', ['Ukraine']], ['argentian', ['Argentina']], ['venezeula', ['Venezuela']],
  ['colmobia', ['Colombia']], ['ecuadro', ['Ecuador']], ['bolivai', ['Bolivia']], ['tanzanai', ['Tanzania']], ['ethiopai', ['Ethiopia']], ['kneya', ['Kenya']],
  ['franc e', ['France']], ['fra nce', ['France']], ['f rance', ['France']], ['frnace', ['France']], ['frqnce', ['France']], [';france', 'France'], ['france\\', 'France'],
  ['france]', 'France'], ['france1', ['France']], ['ffrance', ['France']], ['rance', ['France']], ['franc', ['France']], ['nigeriq', ['Nigeria']], ['zamvia', ['Zambia']],
  ['gamvia', ['Gambia']], ['iraw', null], ['irab', null], ['chax', null], ['malo', null], ['perh', null],
  // Pasted text with odd whitespace
  ['\tFrance\n', 'France'], [' france ', 'France'], ['united states', 'United States'], ['united states', 'United States'], ['new\nzealand', 'New Zealand'],
  ['costa   rica', 'Costa Rica'], ['　japan　', 'Japan'], ['ivory\tcoast', 'Ivory Coast'], ['', null], ['   ', null], ['\n', null], [' ', null],
  ['South\r\nAfrica', 'South Africa'], ['Sri Lanka', 'Sri Lanka'], ['United​States', ['United States']],
  // Unicode look-alikes, accents, other scripts
  ['Frаnce', ['France']], ['Сhad', ['Chad']], ['Ｃｈｉｌｅ', 'Chile'], ['𝐅𝐫𝐚𝐧𝐜𝐞', 'France'], ['ℱrance', 'France'], ['Perú', 'Peru'], ['México', 'Mexico'],
  ['España', null], ['Österreich', null], ['Côte d’Ivoire', 'Ivory Coast'], ["Cote d'Ivoire", 'Ivory Coast'], ['COTE D IVOIRE', ['Ivory Coast']], ['Côte-d’Ivoire', 'Ivory Coast'],
  ['Cote dIvoire', 'Ivory Coast'], ['ıran', 'Iran'], ['türkıye', 'Turkey'], ['Ελλάδα', null], ['Россия', null], ['日本', null], ['مصر', null], ['Viet Nam', 'Vietnam'],
  ['Việt Nam', 'Vietnam'], ['Fra​nce', 'France'], ['Fr­ance', 'France'], ['﻿France', 'France'], ['F̶r̶a̶n̶c̶e̶', 'France'],
  ['Brasiĺ', ['Brazil']], ['Ⓕⓡⓐⓝⓒⓔ', 'France'], ['ｆｒａｎｃｅ', 'France'], ['Perú́', 'Peru'], ['ℂ𝕙𝕒𝕕', 'Chad'],
  // Right-to-left marks and overrides
  ['‏France‎', 'France'], ['‮ecnarF', null], ['⁧France⁩', 'France'], ['‫Chad‬', 'Chad'], ['؜Iran', 'Iran'],
  // Emoji
  ['🇫🇷', null], ['France 🇫🇷', 'France'], ['🇨🇭', null], ['😀', null], ['Chad 😀', 'Chad'], ['👍🏽 Peru', 'Peru'], ['🏳️‍🌈', null], ['1️⃣', null], ['❤️Mali❤️', 'Mali'],
  ['Per👍u', 'Peru'], ['👨‍👩‍👧‍👦', null],
  // Punctuation, abbreviations, saints, "the"
  ['St Lucia', 'Saint Lucia'], ['St. Lucia', 'Saint Lucia'], ['St.Lucia', 'Saint Lucia'], ['saint-lucia', 'Saint Lucia'], ['ST LUCIA', 'Saint Lucia'], ['ste lucia', ['Saint Lucia']],
  ['stlucia', ['Saint Lucia']], ['St Kitts & Nevis', 'Saint Kitts and Nevis'], ['St. Kitts', 'Saint Kitts and Nevis'], ['st kitts-nevis', ['Saint Kitts and Nevis']],
  ['St Vincent', 'Saint Vincent and the Grenadines'], ['St. Vincent & the Grenadines', 'Saint Vincent and the Grenadines'],
  ['saint vincent and grenadines', ['Saint Vincent and the Grenadines']], ['Antigua & Barbuda', 'Antigua and Barbuda'], ['Antigua', 'Antigua and Barbuda'],
  ['antigua and barbados', ['Antigua and Barbuda']], ['barbuda', null], ['Trinidad & Tobago', 'Trinidad and Tobago'], ['Trinidad', 'Trinidad and Tobago'], ['tobago', null],
  ['Bosnia', 'Bosnia and Herzegovina'], ['Bosnia & Herzegovina', 'Bosnia and Herzegovina'], ['Bosnia-Herzegovina', 'Bosnia and Herzegovina'],
  ['bosnia hercegovina', ['Bosnia and Herzegovina']], ['herzegovina', null], ['The Netherlands', 'Netherlands'], ['the bahamas', 'Bahamas'], ['the us', 'United States'],
  ['the uk', 'United Kingdom'], ['The Ukraine', 'Ukraine'], ['the', null], ['the the', null], ['st', null], ['saint', null], ['and', null], ['&', null], ['republic', null],
  ['Holland', 'Netherlands'], ['Burma', 'Myanmar'], ['Czechia', 'Czech Republic'], ['Cabo Verde', 'Cape Verde'], ['Eire', 'Ireland'], ['Malvinas', 'Falkland Islands'],
  ['Aotearoa', 'New Zealand'], ['Surinam', 'Suriname'], ['Falklands', 'Falkland Islands'], ['Solomons', 'Solomon Islands'], ['solomon', ['Solomon Islands']],
  ['Emirates', 'United Arab Emirates'], ['Kyrgyz Republic', 'Kyrgyzstan'], ['Lao PDR', 'Laos'], ['Brunei Darussalam', 'Brunei'], ['State of Palestine', 'Palestine'],
  ['TRNC', 'Northern Cyprus'], ['palestinian territories', 'Palestine'], ['(France)', 'France'], ['"France"', 'France'], ['France.', 'France'], ['France?', 'France'],
  ['fr', null], ['FRA', null], ['f', null],
  // Keys that exist on every object
  ['__proto__', null], ['constructor', null], ['prototype', null], ['toString', null], ['hasOwnProperty', null], ['valueOf', null], ['__defineGetter__', null],
  ['null', null], ['undefined', null], ['NaN', null], ['true', null], ['0', null], ['[object Object]', null], ['isPrototypeOf', null],
  // Very long input
  ['a'.repeat(61), null], ['France' + ' '.repeat(55), null], [' '.repeat(54) + 'France', 'France'], ['x'.repeat(10000), null], ['the '.repeat(15), null],
  ['the '.repeat(13) + 'gambia', 'Gambia'], ['ﷺ'.repeat(60), null], ['́'.repeat(60), null], ['France'.repeat(10), null], ['France'.repeat(11), null],
  ['Saint Vincent and the Grenadines', 'Saint Vincent and the Grenadines'], ['turkish republic of northern cyprus', 'Northern Cyprus'],
  ["democratic people's republic of korea".padEnd(60, ' '), 'North Korea'], ["democratic people's republic of korea".padEnd(61, ' '), null]
];
{
  const wrong = [], softGot = [], softNone = [];
  for (const [input, want] of TYPED) {
    const r = M.match(input);
    const got = r ? r.name : null;
    const label = show(input.length > 40 ? input.slice(0, 37) + '...' : input);
    if (Array.isArray(want)) {
      if (got === want[0]) softGot.push(label.replace(/"/g, ''));
      else if (got === null) softNone.push(label.replace(/"/g, '') + '→' + want[0]);
      else wrong.push(label + ' meant ' + want[0] + ' but resolved to ' + got);
      if (r && r.exact) wrong.push(label + ' is a misspelling yet came back exact');
    } else if (got !== want) {
      wrong.push(label + ' expected ' + show(want) + ' got ' + show(got));
    } else if (r && (r.exact !== true || r.outside)) {
      wrong.push(label + ' should be an exact match, got ' + show(r));
    }
  }
  check('matcher: ' + TYPED.length + ' hand-written inputs a real player types', wrong.length === 0, wrong.length ? wrong.join('; ') : softGot.length + ' misspellings forgiven, ' + softNone.length + ' answered with nothing, none sent to a different country');
  info('misspellings FORGIVEN: ' + softGot.join(', '));
  info('misspellings answered with NOTHING: ' + softNone.join(', '));
}
group('matcher: non-string input never matches and never throws', () => {
  for (const bad of [null, undefined, 42, NaN, {}, [], ['France'], true, Symbol('x'), { toString() { return 'France'; } }, new String('France'), () => 'France']) {
    assert.strictEqual(M.match(bad), null, String(typeof bad));
  }
  assert.strictEqual(M.match(), null);
});

/* ===== 10. Real places that are not answers ===== */
{
  const US_STATES = ('Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|' +
    'Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|' +
    'Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming').split('|');
  const OTHER = ('Andorra|Liechtenstein|Malta|Monaco|San Marino|Singapore|Maldives|Seychelles|Sao Tome and Principe|São Tomé|Kiribati|Marshall Islands|Micronesia|Nauru|Palau|' +
    'Samoa|Tonga|Tuvalu|Vatican City|Vatican|Holy See|Greenland|Puerto Rico|Guam|Bermuda|Aruba|Curaçao|Martinique|Guadeloupe|Réunion|Mayotte|Hong Kong|Macau|Macao|Tibet|' +
    'Gibraltar|England|Scotland|Wales|Northern Ireland|Tahiti|Siberia|Sardinia|Sicily|Corsica|Crete|Tasmania|Zanzibar|Borneo|Sumatra|Java|Bali|Kashmir|Kurdistan|Catalonia|' +
    'Bavaria|Anguilla|Montserrat|Cayman Islands|Virgin Islands|Cook Islands|Faroe Islands|Canary Islands|American Samoa|French Polynesia|Guiana|New Guinea|Papua|West Papua|' +
    'Timor|West Timor|Sahara|Korea|Congo|Africa|Asia|Europe|Oceania|Antarctica|Americas|North America|South America|Central America|Latin America|North Africa|West Africa|' +
    'East Africa|Central Africa|Southern Africa|Middle East|Arabia|Scandinavia|Balkans|Iberia|Caribbean|Polynesia|Melanesia|Australasia|Indochina|Patagonia|Prussia|Persia|' +
    'Siam|Ceylon|Zaire|Rhodesia|Yugoslavia|Czechoslovakia|Soviet Union|USSR|Bohemia|Abyssinia|Formosa|Mesopotamia|Moldavia|Transylvania|East Germany|West Germany|' +
    'Tanganyika|Bengal|Malaya|Slavonia|Kampuchea|Dahomey|Gold Coast|Galicia|Silesia|Lapland|Dalmatia|North Sudan|South Cyprus|Southern Cyprus|East Korea|West Korea|' +
    'South Macedonia|Eastern Sahara|Northern Sahara|Upper Volta|Nubia|Flanders|Normandy|Brittany|Andalusia|Tuscany|Lombardy|Wallachia|Burgundy|Saxony|Quebec|Ontario|' +
    'Yukon|Alberta|Manitoba|Nunavut|Queensland|Victoria|Sydney|Melbourne|London|Paris|Berlin|Madrid|Rome|Moscow|Tokyo|Beijing|Delhi|Mumbai|Dubai|Istanbul|Lagos|Cairo|' +
    'New South Wales|Western Australia|South Australia|Northern Territory|British Columbia|Nova Scotia|Newfoundland|Labrador|Saint Helena|Saint Martin|Sint Maarten|' +
    'Saint Pierre|Saint Petersburg|Saint Louis|San Juan|San Diego|San Francisco|Santa Cruz|Santiago|Sao Paulo|Rio de Janeiro|Buenos Aires|Zealand|Caledonia|Herzegovina|' +
    'Kosova Polje|Kalimantan|Sulawesi|Luzon|Mindanao|Hokkaido|Honshu|Sakhalin|Kamchatka|Crimea|Chechnya|Dagestan|Tatarstan|Karelia|Abkhazia|South Ossetia|Transnistria|' +
    'Nagorno-Karabakh|Somali|Puntland|Darfur|Katanga|Biafra|Cabinda|Natal|Transvaal|Zululand|Bechuanaland|Basutoland|Nyasaland|Gaul|Britannia|Hibernia|Germania|Hispania|' +
    'Lusitania|Dacia|Thrace|Anatolia|Levant|Maghreb|Sahel|Hindustan|Punjab|Assam|Kerala|Goa|Baluchistan|Turkestan|Manchuria|Cathay|Nippon|Arctic|Atlantic|Pacific|' +
    'Mediterranean|Baltic|Benelux|Commonwealth|European Union|United Nations|Earth|Mars|Narnia|Wakanda|Atlantis|Neverland|Mordor|Gondor|Hogwarts|Zamunda|Genovia').split('|');
  const cities = [];
  for (const c of COUNTRIES) for (const city of [FACTS[c][0]].concat(FACTS[c][2] || [])) if (!OWNER.has(fold(city))) cities.push(city);
  const resolved = [];
  for (const name of US_STATES.concat(OTHER, cities)) {
    const r = M.match(name);
    if (r) resolved.push(name + ' → ' + r.name + (r.exact ? ' (exact)' : ' (near)'));
  }
  // Georgia is both a state and a country; every other entry here must match nothing.
  check('matcher: ' + (US_STATES.length + OTHER.length + cities.length) + ' real places that are not answers (states, regions, old names, every capital) resolve to nothing',
    resolved.length === 0, resolved.join('; '));

  // Adjectives and peoples: resolving to their own country is fine, to another is not.
  const DEMONYMS = [['Nigerian', 'Nigeria'], ['Nigerien', 'Niger'], ['Guinean', 'Guinea'], ['Dominican', 'Dominican Republic'], ['Austrian', 'Austria'], ['Australian', 'Australia'],
    ['Indian', 'India'], ['Indonesian', 'Indonesia'], ['American', 'United States'], ['Korean', 'South Korea'], ['Irish', 'Ireland'], ['Icelandic', 'Iceland'],
    ['Slovak', 'Slovakia'], ['Slovakian', 'Slovakia'], ['Slovene', 'Slovenia'], ['Slovenian', 'Slovenia'], ['Malian', 'Mali'], ['Malawian', 'Malawi'], ['Malaysian', 'Malaysia'],
    ['Maltese', 'Malta'], ['Mauritian', 'Mauritius'], ['Mauritanian', 'Mauritania'], ['Sudanese', 'Sudan'], ['Congolese', 'Republic of the Congo'], ['Chadian', 'Chad'],
    ['Chilean', 'Chile'], ['Chinese', 'China'], ['Libyan', 'Libya'], ['Liberian', 'Liberia'], ['Latvian', 'Latvia'], ['Lithuanian', 'Lithuania'], ['Iranian', 'Iran'],
    ['Iraqi', 'Iraq'], ['Gambian', 'Gambia'], ['Zambian', 'Zambia'], ['Paraguayan', 'Paraguay'], ['Uruguayan', 'Uruguay'], ['Swiss', 'Switzerland'], ['Swedish', 'Sweden'],
    ['Swazi', 'Eswatini'], ['Dutch', 'Netherlands'], ['Georgian', 'Georgia'], ['Jordanian', 'Jordan'], ['Russian', 'Russia'], ['Prussian', 'Prussia'], ['Persian', 'Iran'],
    ['Belgian', 'Belgium'], ['Bulgarian', 'Bulgaria'], ['Romanian', 'Romania'], ['Roman', 'Italy'], ['Armenian', 'Armenia'], ['Albanian', 'Albania'], ['Algerian', 'Algeria'],
    ['Angolan', 'Angola'], ['Mongolian', 'Mongolia'], ['Somali', 'Somalia'], ['Somalian', 'Somalia'], ['Ugandan', 'Uganda'], ['Rwandan', 'Rwanda'], ['Tunisian', 'Tunisia'],
    ['Colombian', 'Colombia'], ['Columbian', 'Colombia'], ['Grenadian', 'Grenada'], ['Guyanese', 'Guyana'], ['Ghanaian', 'Ghana'], ['Haitian', 'Haiti'], ['Tahitian', 'Tahiti'],
    ['Samoan', 'Samoa'], ['Tongan', 'Tonga'], ['Serbian', 'Serbia'], ['Siberian', 'Siberia'], ['Syrian', 'Syria'], ['Arabian', 'Saudi Arabia'], ['Arab', 'Saudi Arabia'],
    ['Turkish', 'Turkey'], ['Turkmen', 'Turkmenistan'], ['Emirati', 'United Arab Emirates'], ['British', 'United Kingdom'], ['English', 'United Kingdom'], ['Filipino', 'Philippines'],
    ['Bosnian', 'Bosnia and Herzegovina'], ['Macedonian', 'North Macedonia'], ['Cypriot', 'Cyprus'], ['Timorese', 'Timor-Leste'], ['Papuan', 'Papua New Guinea']];
  const bad = [], own = [];
  for (const [word, country] of DEMONYMS) {
    const r = M.match(word);
    if (!r) continue;
    if (r.name === country && !r.exact) own.push(word); else bad.push(word + ' → ' + r.name);
  }
  check('matcher: ' + DEMONYMS.length + ' adjectives ("Nigerien", "Dominican", "Slovak") never resolve to another country', bad.length === 0, bad.join('; ') || 'resolve to their own country as a near match: ' + own.join(', '));
}

/* ===== 11. The worst near matches that ARE accepted, for a human to judge ===== */
{
  const rnd = Quiz.rng(5);
  const pickSome = (arr, k) => { const a = arr.slice(); const out = []; while (a.length && out.length < k) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
  // (a) both edits inside one short word of a longer name: the edits most likely to make a different word
  const oneWord = accepted2.filter(([v, s]) => {
    const a = v.split(' '), b = s.split(' ');
    if (a.length !== b.length || b.length < 2) return false;
    const changed = b.map((w, i) => (w === a[i] ? -1 : i)).filter(i => i >= 0);
    return changed.length === 1 && b[changed[0]].length <= 5 && Quiz.distance(a[changed[0]], b[changed[0]]) === 2;
  });
  info('accepted with BOTH edits in one short word (' + oneWord.length + ' in the sample), 40 at random:');
  info('  ' + pickSome(oneWord, 40).map(a => a[0] + '→' + a[2]).join(' | '));
  // (b) shortest names with the first letter wrong or missing
  const first = accepted1.filter(([v, s]) => s.length <= 7 && v[0] !== s[0]);
  info('accepted one-edit typos of 6-7 letter names with the FIRST letter wrong (' + first.length + '), 40 at random:');
  info('  ' + pickSome(first, 40).map(a => a[0] + '→' + a[2]).join(' | '));
  // (c) the smallest gap between the accepted country and the runner-up
  const sample = pickSome(accepted1, QUICK ? 800 : 4000).concat(pickSome(accepted2, QUICK ? 800 : 4000));
  const scored = sample.map(([v, s, c]) => {
    let mine = 99, other = 99, who = '';
    for (const [t, oc] of SPELLINGS) {
      if (Math.abs(t.length - v.length) > 4) continue;
      const d = Quiz.distance(v, t);
      if (oc === c) mine = Math.min(mine, d); else if (d < other) { other = d; who = t; }
    }
    for (const t of DECOY_LIST) { if (Math.abs(t.length - v.length) > 4) continue; const d = Quiz.distance(v, t); if (d < other) { other = d; who = t + '*'; } }
    return { v, c, mine, other, who, len: s.length };
  });
  scored.sort((x, y) => (x.other - x.mine) - (y.other - y.mine) || x.len - y.len);
  check('matcher: every accepted near match is at least two edits closer to its country than to any other', scored.every(x => x.other - x.mine >= 2 || x.who.endsWith('*')),
    'closest calls in a sample of ' + scored.length);
  info('  ' + scored.slice(0, 30).map(x => x.v + '→' + x.c + ' (' + x.mine + ' vs ' + x.other + ' from ' + x.who + ')').join(' | '));
  const decoyClose = scored.filter(x => x.who.endsWith('*') && x.other - x.mine < 2);
  info('accepted although a non-answer place (*) is only one edit further (' + decoyClose.length + ' in the sample), 30: ' +
    decoyClose.slice(0, 30).map(x => x.v + '→' + x.c + ' (' + x.who + ' at ' + x.other + ')').join(' | '));
}

/* ===== 12. restrictTo ===== */
group('matcher: restrictTo', () => {
  const europe = Quiz.matcher(ENTRIES, { restrictTo: CONTINENTS.Europe });
  assert.deepStrictEqual(europe.match('France'), { name: 'France', exact: true, via: 'name' });
  assert.deepStrictEqual(europe.match('holland'), { name: 'Netherlands', exact: true, via: 'alias' });
  assert.deepStrictEqual(europe.match('Brazil'), { name: 'Brazil', outside: true });
  assert.deepStrictEqual(europe.match('usa'), { name: 'United States', outside: true });
  assert.deepStrictEqual(europe.match('Niger'), { name: 'Niger', outside: true, partial: true });
  assert.deepStrictEqual(europe.match('frnace'), { name: 'France', exact: false, via: 'near' });
  // A misspelling of a place outside the level is nothing, not "outside" and not a European near-miss.
  assert.strictEqual(europe.match('brazill'), null);
  assert.strictEqual(europe.match('columbia'), null);
  // Australia is outside, but it still makes "austrlia" ambiguous.
  assert.strictEqual(europe.match('austrlia'), null);
  assert.strictEqual(europe.match('austraia'), null);
  assert.strictEqual(europe.match('prussia'), null);
  assert.strictEqual(europe.match(''), null);
  // The whole table, restricted to each continent in turn, never disagrees with the unrestricted matcher.
  let n = 0;
  for (const region of Object.keys(CONTINENTS)) {
    const inside = new Set(CONTINENTS[region]);
    const m = Quiz.matcher(ENTRIES, { restrictTo: CONTINENTS[region] });
    const probes = SPELLINGS.map(s => s[2]).concat(accepted1.filter((a, i) => i % 23 === 0).map(a => a[0]), TYPED.map(t => t[0]));
    for (const p of probes) {
      const all = M.match(p), r = m.match(p);
      if (!all) assert.strictEqual(r, null, region + ' ' + show(p));
      else if (inside.has(all.name)) assert.deepStrictEqual(r, all, region + ' ' + show(p));
      else if (all.exact) assert.deepStrictEqual(r, all.partial ? { name: all.name, outside: true, partial: true } : { name: all.name, outside: true }, region + ' ' + show(p));
      else assert.strictEqual(r, null, region + ' ' + show(p));
      n++;
    }
  }
  const odd = Quiz.matcher(ENTRIES, { restrictTo: ['France', 'Atlantis', '__proto__', 'constructor', 7, null] });
  assert.strictEqual(odd.match('france').name, 'France');
  assert.deepStrictEqual(odd.match('spain'), { name: 'Spain', outside: true });
  assert.strictEqual(odd.match('atlantis'), null);
  const none = Quiz.matcher(ENTRIES, { restrictTo: [] });
  assert.deepStrictEqual(none.match('france'), { name: 'France', outside: true });
  assert.strictEqual(none.match('frnace'), null);
  return n + ' cross-checks against the unrestricted matcher';
});

group('matcher: decoys option, and entries that look like object keys', () => {
  const plain = Quiz.matcher(ENTRIES, { decoys: [] });
  assert.strictEqual(plain.match('prussia').name, 'Russia');           // what the bare rule does without the list
  assert.strictEqual(plain.match('north sudan'), null);                // compass swaps are generated regardless
  assert.strictEqual(plain.match('south america').name, 'South Africa');
  const mine = Quiz.matcher(ENTRIES, { decoys: ['Georgia', 'Narnia', '', '...', 5, 'France'] });
  assert.strictEqual(mine.match('Georgia').name, 'Georgia');           // a decoy never displaces an answer
  assert.strictEqual(mine.match('France').name, 'France');
  assert.strictEqual(mine.match('narnia'), null);
  for (const d of Quiz.DECOYS) assert(!OWNER.has(fold(d)), 'built-in decoy "' + d + '" is an accepted spelling of ' + OWNER.get(fold(d)));
  for (const d of Quiz.DECOYS) assert.strictEqual(M.match(d), null, d);
  const keys = Quiz.matcher([{ name: '__proto__', aliases: ['constructor'] }, { name: 'toString' }, { name: 'hasOwnProperty', aliases: ['valueOf'] }], { restrictTo: ['__proto__'] });
  assert.deepStrictEqual(keys.match('__proto__'), { name: '__proto__', exact: true, via: 'name' });
  assert.deepStrictEqual(keys.match('constructor'), { name: '__proto__', exact: true, via: 'alias' });
  assert.deepStrictEqual(keys.match('tostring'), { name: 'toString', outside: true });
  assert.strictEqual(keys.match('isPrototypeOf'), null);
  assert.deepStrictEqual(Quiz.entries(['__proto__', 'constructor', 'France', 3], { France: ['fr'], constructor: 7 }),
    [{ name: '__proto__', aliases: [] }, { name: 'constructor', aliases: [] }, { name: 'France', aliases: ['fr'] }]);
  assert.deepStrictEqual(Quiz.entries(null, null), []);
});

/* ===== 13. Capitals ===== */
const CAPITAL_OF = new Map(COUNTRIES.map(c => [c, FACTS[c][0]]));
const FIRST_CAPITALS = new Set(CAPITAL_OF.values());
group('capitals: capitalOf, isCapital and capitalOwners over the whole table', () => {
  let shared = [];
  for (const c of COUNTRIES) {
    const got = Quiz.capitalOf(FACTS, c);
    assert.strictEqual(got.capital, FACTS[c][0]);
    assert.deepStrictEqual(got.alternates, FACTS[c][2] || []);
    for (const city of [got.capital].concat(got.alternates)) {
      for (const text of [city, city.toUpperCase(), '  ' + city + ' ', city.normalize('NFD').replace(/[̀-ͯ]/g, ''), city.replace(/['.,]/g, '')]) {
        assert(Quiz.isCapital(FACTS, c, text), c + ' ' + show(text));
      }
      const owners = Quiz.capitalOwners(FACTS, city);
      assert(owners.includes(c));
      if (owners.length > 1) shared.push(city + ': ' + owners.join(' + '));
    }
    assert(!Quiz.isCapital(FACTS, c, ''), c);
    assert(!Quiz.isCapital(FACTS, c, c === 'France' ? 'London' : 'Paris'), c);
    assert(!Quiz.isCapital(FACTS, c, 'x'.repeat(61)));
  }
  shared = [...new Set(shared)].sort();
  assert.deepStrictEqual(shared, ['Jerusalem: Israel + Palestine', 'Nicosia: Cyprus + Northern Cyprus']);
  assert(Quiz.isCapital(FACTS, 'United States', 'washington dc') && Quiz.isCapital(FACTS, 'Chad', 'Ndjamena') && Quiz.isCapital(FACTS, 'Antigua and Barbuda', "St. John's"));
  assert(Quiz.isCapital(FACTS, 'South Africa', 'cape town') && Quiz.isCapital(FACTS, 'Bolivia', 'LA PAZ') && Quiz.isCapital(FACTS, 'Palestine', 'jerusalem'));
  assert(!Quiz.isCapital(FACTS, 'Netherlands', 'The Hague') && !Quiz.isCapital(FACTS, 'Tanzania', 'Dar es Salaam') && !Quiz.isCapital(FACTS, 'Israel', 'Tel Aviv'));
  assert(!Quiz.isCapital(FACTS, 'Equatorial Guinea', 'La Paz') && !Quiz.isCapital(FACTS, 'Cyprus', 'North Nicosia') && !Quiz.isCapital(FACTS, 'Israel', 'East Jerusalem'));
  for (const key of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'Atlantis', '', null, undefined, 5, {}]) {
    assert.strictEqual(Quiz.capitalOf(FACTS, key), null, String(key));
    assert.strictEqual(Quiz.isCapital(FACTS, key, 'Paris'), false);
    assert.strictEqual(Quiz.capitalPrompt(FACTS, key), null);
    assert.deepStrictEqual(Quiz.capitalChoices(FACTS, key, COUNTRIES, Quiz.rng(1)), []);
    assert.strictEqual(Quiz.hasFlag(FACTS, key), false);
  }
  assert.strictEqual(Quiz.capitalOf(null, 'France'), null);
  assert.strictEqual(Quiz.capitalOf({ France: 'Paris' }, 'France'), null);
  assert.strictEqual(Quiz.capitalOf({ France: [''] }, 'France'), null);
  assert.deepStrictEqual(Quiz.capitalOwners(FACTS, 'Atlantis City'), []);
  assert.deepStrictEqual(Quiz.capitalOwners(null, 'Paris'), []);
  info('cities accepted for two countries: ' + shared.join('; '));
});

group('capitals: capitalPrompt flags exactly the capitals that carry the country\'s own name', () => {
  const trivial = COUNTRIES.filter(c => Quiz.capitalPrompt(FACTS, c).trivial);
  assert.deepStrictEqual(trivial, COUNTRIES.filter(c => FACTS[c][0].toLowerCase() === c.toLowerCase()));
  assert.deepStrictEqual(trivial, ['Djibouti', 'Luxembourg']);
  for (const c of ['Guatemala', 'Kuwait', 'Mexico', 'Panama', 'Guinea-Bissau', 'Tunisia', 'Algeria', 'Brazil', 'El Salvador']) assert.strictEqual(Quiz.capitalPrompt(FACTS, c).trivial, false, c);
  for (const c of COUNTRIES) {
    const p = Quiz.capitalPrompt(FACTS, c);
    assert.strictEqual(p.capital, FACTS[c][0]);
    assert(p.accept.includes(c));
    if (p.accept.length > 1) assert(['Cyprus', 'Israel'].includes(c), c + ' ' + p.accept);
  }
  assert.deepStrictEqual(Quiz.capitalPrompt(FACTS, 'Cyprus').accept, ['Cyprus', 'Northern Cyprus']);
  assert.deepStrictEqual(Quiz.capitalPrompt(FACTS, 'Israel').accept, ['Israel', 'Palestine']);
  assert.deepStrictEqual(Quiz.capitalPrompt(FACTS, 'Northern Cyprus'), { capital: 'North Nicosia', trivial: false, accept: ['Northern Cyprus'] });
  return 'trivial: ' + trivial.join(', ');
});

group('rng: Mulberry32, deterministic, in [0, 1), string seeds', () => {
  const a = Quiz.rng(1), b = Quiz.rng(1), c = Quiz.rng(2);
  const xs = [], ys = [], zs = [];
  for (let i = 0; i < 1000; i++) { xs.push(a()); ys.push(b()); zs.push(c()); }
  assert.deepStrictEqual(xs, ys);
  assert.notDeepStrictEqual(xs, zs);
  assert(xs.every(x => x >= 0 && x < 1));
  // Known first outputs of Mulberry32 for seed 1 and seed 0 (reference implementation).
  const ref = seed => { let t = (seed + 0x6D2B79F5) | 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  assert.strictEqual(Quiz.rng(1)(), ref(1));
  assert.strictEqual(Quiz.rng(0)(), ref(0));
  assert.strictEqual(Quiz.rng(123456789)(), ref(123456789));
  assert.strictEqual(Quiz.rng('2026-11-17')(), Quiz.rng('2026-11-17')());
  assert.notStrictEqual(Quiz.rng('2026-11-17')(), Quiz.rng('2026-11-18')());
  for (const odd of [undefined, null, NaN, -1, 1.5, Infinity, {}, '']) { const v = Quiz.rng(odd)(); assert(v >= 0 && v < 1, String(odd)); }
  const buckets = new Array(10).fill(0), g = Quiz.rng(42);
  for (let i = 0; i < 100000; i++) buckets[Math.floor(g() * 10)]++;
  const chi = buckets.reduce((t, n) => t + (n - 10000) * (n - 10000) / 10000, 0);
  assert(chi < 27.88, 'chi-square ' + chi);   // 9 degrees of freedom, p = 0.001
  return 'chi-square over 10 bins: ' + chi.toFixed(2);
});

// Checks one capitalChoices result against every rule; returns nothing or throws.
function checkChoices(facts, country, pool, out, n, label) {
  const row = facts[country];
  const answer = row[0], alternates = row[2] || [];
  const all = Object.keys(facts).filter(c => Array.isArray(facts[c]) && typeof facts[c][0] === 'string' && facts[c][0] !== '');
  const firsts = new Map();        // folded first-listed capital -> countries
  for (const c of all) { const f = fold(facts[c][0]); if (!firsts.has(f)) firsts.set(f, []); firsts.get(f).push(c); }
  assert(Array.isArray(out), label + ': not an array');
  assert(out.every(o => typeof o === 'string' && o !== ''), label + ': bad option ' + show(out));
  assert.strictEqual(out.filter(o => o === answer).length, 1, label + ': answer not present exactly once in ' + show(out));
  const folded = out.map(fold);
  assert.strictEqual(new Set(folded).size, out.length, label + ': two options with the same folded name ' + show(out));
  const banned = alternates.map(fold);
  const contains = (a, b) => a.indexOf(b) !== -1 || b.indexOf(a) !== -1;
  out.forEach((o, i) => {
    if (o === answer) return;
    assert(firsts.has(folded[i]), label + ': ' + o + ' is not a first-listed capital');
    assert(!firsts.get(folded[i]).includes(country) || firsts.get(folded[i]).length > 1, label + ': own capital offered twice');
    assert(!banned.includes(folded[i]), label + ': ' + o + ' is an alternate capital of ' + country);
    for (const b of banned) assert(!contains(folded[i], b), label + ': ' + o + ' reads like the alternate capital ' + b);
  });
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) assert(!contains(folded[i], folded[j]), label + ': ' + out[i] + ' / ' + out[j] + ' contain one another');
  // Length: n unless the whole table cannot supply that many compatible cities.
  const want = Math.max(1, n);
  if (out.length < want) {
    for (const c of all) {
      if (c === country) continue;
      const f = fold(facts[c][0]);
      assert(folded.some(g => contains(f, g)) || banned.some(b => contains(f, b)), label + ': only ' + out.length + ' options though ' + facts[c][0] + ' was available');
    }
  } else {
    assert.strictEqual(out.length, want, label + ': too many options');
  }
  // Pool first: an option from outside the pool is only allowed when no unused pool capital would fit.
  const poolSet = new Set((Array.isArray(pool) ? pool : []).filter(c => typeof c === 'string' && c !== country && all.includes(c)));
  const poolCities = new Set([...poolSet].map(c => fold(facts[c][0])));
  const outsiders = folded.filter((f, i) => out[i] !== answer && !poolCities.has(f));
  if (outsiders.length) {
    for (const f of poolCities) {
      if (folded.includes(f)) continue;
      assert(folded.some(g => out[folded.indexOf(g)] !== undefined && !outsiders.includes(g) && contains(f, g)) || banned.some(b => contains(f, b)) || contains(f, fold(answer)),
        label + ': went outside the pool though ' + f + ' was free');
    }
  }
}

// Chi-square statistic of observed counts against a flat expectation.
function chiSquare(counts) {
  const total = counts.reduce((a, b) => a + b, 0), expect = total / counts.length;
  return counts.reduce((t, n) => t + (n - expect) * (n - expect) / expect, 0);
}
const CHI_3DF = 16.27, CHI_P001 = { 1: 10.83, 2: 13.82, 3: 16.27, 4: 18.47, 5: 20.52, 9: 27.88 };
const continentOf = new Map();
for (const region of Object.keys(CONTINENTS)) for (const c of CONTINENTS[region]) continentOf.set(c, region);

{
  const SEEDS = QUICK ? 40 : 200;
  let calls = 0;
  const position = { continent: [0, 0, 0, 0], world: [0, 0, 0, 0] };
  const perCountry = new Map();
  const errors = [];
  const seenDistractors = new Map();    // country -> set of distractors seen from its continent pool
  const outsideUse = { continent: 0, world: 0 };
  for (const c of COUNTRIES) {
    const pools = { continent: CONTINENTS[continentOf.get(c)], world: COUNTRIES };
    perCountry.set(c, [0, 0, 0, 0]);
    seenDistractors.set(c, new Set());
    for (const kind of ['continent', 'world']) {
      for (let seed = 0; seed < SEEDS; seed++) {
        try {
          const out = Quiz.capitalChoices(FACTS, c, pools[kind], Quiz.rng(c + '|' + kind + '|' + seed));
          calls++;
          checkChoices(FACTS, c, pools[kind], out, 4, c + ' / ' + kind + ' / seed ' + seed);
          assert.strictEqual(out.length, 4, c + ': ' + out.length + ' options');
          const at = out.indexOf(FACTS[c][0]);
          position[kind][at]++;
          perCountry.get(c)[at]++;
          const poolCaps = new Set(pools[kind].map(p => FACTS[p][0]));
          if (out.some(o => !poolCaps.has(o))) outsideUse[kind]++;
          if (kind === 'continent') out.forEach(o => { if (o !== FACTS[c][0]) seenDistractors.get(c).add(o); });
          // Same seed, same answer.
          if (seed < 3) assert.deepStrictEqual(Quiz.capitalChoices(FACTS, c, pools[kind], Quiz.rng(c + '|' + kind + '|' + seed)), out, c + ': not deterministic');
        } catch (e) { errors.push(e.message.split('\n')[0]); }
      }
    }
  }
  check('capitalChoices: every country x ' + SEEDS + ' seeds x (its continent, the world) obeys every rule', errors.length === 0,
    calls + ' calls' + (errors.length ? '; ' + errors.length + ' failures, first: ' + errors.slice(0, 3).join('; ') : ''));
  const chiC = chiSquare(position.continent), chiW = chiSquare(position.world);
  check('capitalChoices: the answer\'s position is uniform (chi-square, 3 df, p = 0.001 at 16.27)', chiC < CHI_3DF && chiW < CHI_3DF,
    'continent pool ' + show(position.continent) + ' chi2 ' + chiC.toFixed(2) + '; world pool ' + show(position.world) + ' chi2 ' + chiW.toFixed(2));
  // No single country may have a favourite slot either: with 185 tests at p = 0.001, expect about 0.2 beyond 16.27.
  const skewed = [...perCountry].map(([c, counts]) => [chiSquare(counts), c, counts]).filter(x => x[0] > 21.1);
  check('capitalChoices: no single country has a favourite slot (per-country chi-square, p = 0.0001 at 21.1)', skewed.length === 0,
    skewed.length ? skewed.map(x => x[1] + ' ' + show(x[2])).join('; ') : 'largest ' + Math.max(...[...perCountry.values()].map(chiSquare)).toFixed(2));
  check('capitalChoices: a continent pool never needs the rest of the world', outsideUse.continent === 0 && outsideUse.world === 0, show(outsideUse));
  // Every legal neighbour shows up as a wrong option sooner or later, so no capital is starved by the shuffle.
  if (!QUICK) {
    const starved = [];
    for (const c of COUNTRIES) {
      const banned = [FACTS[c][0]].concat(FACTS[c][2] || []).map(fold);
      for (const other of CONTINENTS[continentOf.get(c)]) {
        if (other === c) continue;
        const f = fold(FACTS[other][0]);
        if (banned.some(b => b.indexOf(f) !== -1 || f.indexOf(b) !== -1)) continue;
        // Chance of never appearing in 200 draws of 3 from at most 53 is under 1e-5 even for Africa.
        if (!seenDistractors.get(c).has(FACTS[other][0]) && CONTINENTS[continentOf.get(c)].length <= 54) starved.push(c + ' never offered ' + FACTS[other][0]);
      }
    }
    check('capitalChoices: every legal neighbour capital is offered at some point', starved.length <= 2, starved.length + ' pairs unseen in 200 seeds' + (starved.length ? ': ' + starved.slice(0, 4).join('; ') : ''));
  }
}

group('capitalChoices: the pairs the data warns about never share a question', () => {
  let n = 0;
  const pairs = [['Cyprus', 'North Nicosia'], ['Northern Cyprus', 'Nicosia'], ['Israel', 'East Jerusalem'], ['Palestine', 'Jerusalem'], ['Bolivia', 'Ciudad de la Paz'],
    ['Equatorial Guinea', 'La Paz'], ['Equatorial Guinea', 'Malabo'], ['South Africa', 'Cape Town'], ['South Africa', 'Bloemfontein'], ['Yemen', 'Aden'], ['Sri Lanka', 'Colombo'],
    ['Benin', 'Cotonou'], ['Burundi', 'Bujumbura'], ['Eswatini', 'Lobamba'], ['Ivory Coast', 'Abidjan']];
  for (const [country, never] of pairs) {
    for (let seed = 0; seed < 400; seed++) {
      for (const pool of [COUNTRIES, ['Cyprus', 'Northern Cyprus', 'Israel', 'Palestine', 'Bolivia', 'Equatorial Guinea'], CONTINENTS[continentOf.get(country)]]) {
        const out = Quiz.capitalChoices(FACTS, country, pool, Quiz.rng(seed));
        assert(!out.includes(never), country + ' offered ' + never);
        assert(!(out.includes('Nicosia') && out.includes('North Nicosia')), 'both Nicosias in ' + show(out));
        n++;
      }
    }
  }
  // Somebody else's question can still not hold both halves of Nicosia.
  for (let seed = 0; seed < 3000; seed++) {
    const out = Quiz.capitalChoices(FACTS, 'Japan', ['Cyprus', 'Northern Cyprus', 'Israel'], Quiz.rng(seed));
    assert(!(out.includes('Nicosia') && out.includes('North Nicosia')), show(out));
    assert.strictEqual(out.length, 4);
    n++;
  }
  // Which first-listed capitals contain another capital or alternate anywhere in the table.
  const cities = [];
  for (const c of COUNTRIES) for (const city of [FACTS[c][0]].concat(FACTS[c][2] || [])) cities.push([fold(city), city, c]);
  const clash = new Set();
  for (const [f, city, c] of cities) for (const [g, other, d] of cities) if (c !== d && f !== g && f.indexOf(g) !== -1) clash.add(other + ' (' + d + ') inside ' + city + ' (' + c + ')');
  info('capital names contained in another country\'s capital name: ' + [...clash].join('; '));
  const same = new Set();
  for (const [f, city, c] of cities) for (const [g, other, d] of cities) if (c < d && f === g) same.add(city + ': ' + c + ' / ' + d);
  info('one city, two countries: ' + [...same].join('; '));
  return n + ' draws';
});

{
  // Small, odd and hostile pools.
  const rnd = Quiz.rng(314);
  const errors = [];
  let calls = 0;
  const smallPos = [0, 0, 0, 0];
  const junk = ['Atlantis', '__proto__', 'constructor', 'toString', '', null, undefined, 7, {}, ['France'], 'france', 'FRANCE ', 'Paris'];
  const SEEDS = QUICK ? 6 : 30;
  for (const c of COUNTRIES) {
    const pools = [[], undefined, null, 'France', 42, {}, [c], [c, c, c], junk, junk.concat(c)];
    for (let size = 1; size <= 3; size++) {
      for (let t = 0; t < 4; t++) {
        const p = [];
        for (let k = 0; k < size; k++) p.push(COUNTRIES[Math.floor(rnd() * COUNTRIES.length)]);
        pools.push(p);
        pools.push(p.concat(junk.slice(0, 3 + t)));
      }
    }
    pools.push(['Cyprus', 'Northern Cyprus'], ['Israel', 'Palestine', 'Northern Cyprus'], ['Bolivia', 'Equatorial Guinea', 'Cyprus'], ['Djibouti', 'Luxembourg', 'Djibouti']);
    pools.push(CONTINENTS[continentOf.get(c)].concat(junk), COUNTRIES.concat(COUNTRIES));
    pools.forEach((pool, pi) => {
      for (let seed = 0; seed < SEEDS; seed++) {
        try {
          const out = Quiz.capitalChoices(FACTS, c, pool, Quiz.rng(c + '|' + pi + '|' + seed));
          calls++;
          checkChoices(FACTS, c, pool, out, 4, c + ' / pool ' + String(show(pool)).slice(0, 60) + ' / seed ' + seed);
          assert.strictEqual(out.length, 4);
          if (pi < 34) smallPos[out.indexOf(FACTS[c][0])]++;
          // As many options as possible come from the pool.
          if (Array.isArray(pool)) {
            const legalPool = [...new Set(pool.filter(x => typeof x === 'string' && x !== c && Object.prototype.hasOwnProperty.call(FACTS, x)))];
            const poolCaps = new Set(legalPool.map(x => FACTS[x][0]));
            const used = out.filter(o => o !== FACTS[c][0] && poolCaps.has(o)).length;
            if (legalPool.length >= 1 && used === 0) {
              // Only acceptable when every pool capital clashes with the answer or its alternates.
              const banned = [FACTS[c][0]].concat(FACTS[c][2] || []).map(fold);
              assert(legalPool.every(x => banned.some(b => b.indexOf(fold(FACTS[x][0])) !== -1 || fold(FACTS[x][0]).indexOf(b) !== -1)), c + ': ignored the pool ' + show(legalPool));
            }
          }
        } catch (e) { errors.push(e.message.split('\n')[0]); }
      }
    });
  }
  check('capitalChoices: pools of 0-3 countries, pools with unknown names and junk, duplicated pools', errors.length === 0,
    calls + ' calls' + (errors.length ? '; ' + errors.length + ' failures, first: ' + errors.slice(0, 3).join('; ') : ''));
  const chi = chiSquare(smallPos);
  check('capitalChoices: answer position stays uniform with tiny pools', chi < CHI_3DF, show(smallPos) + ' chi2 ' + chi.toFixed(2));
}

group('capitalChoices: other sizes of n, a broken rng, and tables too small to fill a question', () => {
  let calls = 0;
  const rnd = Quiz.rng(77);
  for (const n of [1, 2, 3, 5, 6, 10, 50, 184, 185, 186, 500]) {
    const pos = new Array(Math.min(n, 185)).fill(0);
    for (let t = 0; t < (QUICK ? 60 : 400); t++) {
      const c = COUNTRIES[Math.floor(rnd() * COUNTRIES.length)];
      const pool = t % 2 ? CONTINENTS[continentOf.get(c)] : COUNTRIES;
      const out = Quiz.capitalChoices(FACTS, c, pool, Quiz.rng(c + '|' + n + '|' + t), n);
      calls++;
      checkChoices(FACTS, c, pool, out, n, c + ' n=' + n);
      if (n <= 10) assert.strictEqual(out.length, n, c + ' n=' + n);
      else if (n >= 185) assert(out.length >= 180 && out.length <= 185, 'n=' + n + ' gave ' + out.length);
      pos[out.indexOf(FACTS[c][0])]++;
    }
    if (n >= 2 && n <= 6 && !QUICK) assert(chiSquare(pos) < CHI_P001[n - 1], 'n=' + n + ' position skew ' + show(pos));
  }
  for (const n of [0, -3, NaN, null, undefined, '4', 2.9, Infinity]) {
    const out = Quiz.capitalChoices(FACTS, 'Peru', CONTINENTS['South America'], Quiz.rng(1), n);
    const want = n === 0 || n === -3 ? 1 : n === 2.9 ? 2 : 4;
    assert.strictEqual(out.length, want, 'n=' + String(n) + ' gave ' + out.length);
    assert(out.includes('Lima'));
  }
  // Generators that break their contract must not crash, loop or break a rule.
  const broken = { one: () => 1, big: () => 7.5, negative: () => -0.3, nan: () => NaN, zero: () => 0, almost: () => 0.9999999999, text: () => 'x', none: () => undefined };
  for (const key of Object.keys(broken)) {
    for (const c of COUNTRIES) {
      const out = Quiz.capitalChoices(FACTS, c, CONTINENTS[continentOf.get(c)], broken[key]);
      calls++;
      checkChoices(FACTS, c, CONTINENTS[continentOf.get(c)], out, 4, c + ' rng ' + key);
      assert.strictEqual(out.length, 4);
    }
  }
  for (const notFn of [undefined, null, 5, 'seed', {}]) assert.strictEqual(Quiz.capitalChoices(FACTS, 'Peru', COUNTRIES, notFn).length, 4);
  // Tables that cannot fill four options.
  const tiny = { A: ['Alpha', 'AA'], B: ['Beta', 'BB'] };
  assert.deepStrictEqual(Quiz.capitalChoices(tiny, 'A', ['B'], Quiz.rng(1)).sort(), ['Alpha', 'Beta']);
  assert.deepStrictEqual(Quiz.capitalChoices({ A: ['Alpha', 'AA'] }, 'A', ['A'], Quiz.rng(1)), ['Alpha']);
  const clashing = { A: ['La Paz', 'AA'], B: ['Ciudad de la Paz', 'BB'], C: ['la paz', 'CC'], D: ['Paz', 'DD'], E: ['Quito', 'EE', ['Lima']], F: ['Lima', 'FF'], G: ['Old Lima Town', 'GG'], H: ['', 'HH'], I: 'nope', J: [5, 'JJ'] };
  for (let seed = 0; seed < 300; seed++) {
    for (const c of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      const out = Quiz.capitalChoices(clashing, c, Object.keys(clashing), Quiz.rng(seed));
      calls++;
      checkChoices(clashing, c, Object.keys(clashing), out, 4, 'clashing ' + c + ' seed ' + seed);
    }
  }
  assert.deepStrictEqual(Quiz.capitalChoices(clashing, 'H', ['A'], Quiz.rng(1)), []);
  assert.deepStrictEqual(Quiz.capitalChoices(clashing, 'I', ['A'], Quiz.rng(1)), []);
  // Several countries sharing one capital spelling.
  const twins = { A: ['Same City', 'AA'], B: ['same city', 'BB'], C: ['Same-City', 'CC'], D: ['Other', 'DD'], E: ['Third', 'EE'], F: ['Fourth', 'FF'], G: ['Fifth', 'GG'] };
  for (let seed = 0; seed < 300; seed++) {
    for (const c of Object.keys(twins)) { const out = Quiz.capitalChoices(twins, c, Object.keys(twins), Quiz.rng(seed)); checkChoices(twins, c, Object.keys(twins), out, 4, 'twins ' + c); assert.strictEqual(out.length, 4); calls++; }
  }
  return calls + ' calls';
});

/* ===== 14. Flags ===== */
group('flags: flagEmoji and hasFlag', () => {
  assert.strictEqual(Quiz.flagEmoji('FR'), '\u{1F1EB}\u{1F1F7}');
  assert.strictEqual(Quiz.flagEmoji('US'), '🇺🇸');
  assert.strictEqual(Quiz.flagEmoji('XK'), '🇽🇰');
  for (const bad of ['XS', 'XN', 'fr', 'Fr', 'F', 'FRA', '', ' FR', 'F R', '12', 'É1', 'ÉÉ', null, undefined, 42, {}, ['F', 'R'], '🇫🇷']) assert.strictEqual(Quiz.flagEmoji(bad), '', String(bad));
  const seen = new Map();
  for (const c of COUNTRIES) {
    const code = FACTS[c][1], flag = Quiz.flagEmoji(code);
    if (code === 'XS' || code === 'XN') { assert.strictEqual(flag, ''); continue; }
    assert.strictEqual([...flag].length, 2, c);
    assert.strictEqual(flag.length, 4, c);
    for (const ch of flag) { const cp = ch.codePointAt(0); assert(cp >= 0x1F1E6 && cp <= 0x1F1FF, c); }
    assert.strictEqual([...flag].map(ch => String.fromCharCode(ch.codePointAt(0) - 0x1F1E6 + 65)).join(''), code);
    assert(!seen.has(flag), c + ' shares a flag with ' + seen.get(flag));
    seen.set(flag, c);
  }
  let missing = null;
  try { missing = JSON.parse(fs.readFileSync(path.join(__dirname, 'flags-missing.json'), 'utf8')); } catch (e) { /* flag-check.js has not run yet */ }
  const none = COUNTRIES.filter(c => !Quiz.hasFlag(FACTS, c));
  assert(none.includes('Somaliland') && none.includes('Northern Cyprus'));
  assert(Array.isArray(missing), 'flags-missing.json not found: run flag-check.js first');
  const stale = COUNTRIES.filter(c => Quiz.FLAG_STALE.includes(FACTS[c][1]));
  assert.deepStrictEqual(stale, ['Syria']);
  assert.deepStrictEqual(none.slice().sort(), missing.concat(stale).sort(), 'hasFlag disagrees with flags-missing.json plus the out-of-date list');
  for (const c of COUNTRIES) {
    const p = Quiz.flagPrompt(FACTS, c);
    if (none.includes(c)) { assert.strictEqual(p, null, c); continue; }
    assert.strictEqual(p.flag, Quiz.flagEmoji(FACTS[c][1]));
    assert.deepStrictEqual(p.accept, c === 'Chad' ? ['Chad', 'Romania'] : c === 'Romania' ? ['Romania', 'Chad'] : [c], c);
  }
  for (const key of ['__proto__', 'constructor', 'Atlantis', null, undefined, 5]) assert.strictEqual(Quiz.flagPrompt(FACTS, key), null);
  assert.deepStrictEqual(Quiz.flagPrompt({ A: ['x', 'ID'], B: ['y', 'MC'], C: ['z', 'SY'] }, 'A'), { flag: Quiz.flagEmoji('ID'), accept: ['A', 'B'] });
  assert.strictEqual(Quiz.flagPrompt({ A: ['x', 'ID'], B: ['y', 'MC'], C: ['z', 'SY'] }, 'C'), null);
  assert.deepStrictEqual(Quiz.FLAG_NO_GLYPH.slice().sort(), missing.map(c => FACTS[c][1]).filter(code => code !== 'XS' && code !== 'XN').sort());
  assert.strictEqual(Quiz.hasFlag({ X: ['City', 'zz'] }, 'X'), false);
  assert.strictEqual(Quiz.hasFlag({ X: ['City'] }, 'X'), false);
  assert.strictEqual(Quiz.hasFlag(null, 'France'), false);
  return (COUNTRIES.length - none.length) + ' flags; none for: ' + none.join(', ');
});

// A stand-in document: fonts.load answers as told, and the canvas reports the given widths and colours.
function fakeDocument(opts) {
  const calls = { load: 0, canvas: 0 };
  const doc = {
    calls,
    defaultView: { setTimeout: (fn, ms) => setTimeout(fn, opts.fast ? 5 : ms) },
    createElement(tag) {
      assert.strictEqual(tag, 'canvas');
      calls.canvas++;
      if (opts.canvasThrows) throw new Error('no canvas');
      return {
        width: 0, height: 0,
        getContext() {
          if (opts.noContext) return null;
          return {
            measureText(text) { return { width: [...text].length === 2 ? opts.pairWidth : opts.letterWidth }; },
            fillText() {},
            getImageData(x, y, w, h) {
              const data = new Uint8ClampedArray(w * h * 4);
              for (let i = 0; i < opts.pixels; i++) { data[i * 4] = opts.rgb[0]; data[i * 4 + 1] = opts.rgb[1]; data[i * 4 + 2] = opts.rgb[2]; data[i * 4 + 3] = 255; }
              return { data };
            }
          };
        }
      };
    }
  };
  if (opts.fonts !== 'absent') {
    doc.fonts = { load(font, text) {
      calls.load++;
      calls.font = font; calls.text = text;
      if (opts.fonts === 'throws') throw new Error('boom');
      if (opts.fonts === 'rejects') return Promise.reject(new Error('network'));
      if (opts.fonts === 'never') return new Promise(() => {});
      return Promise.resolve(opts.fonts === 'loaded' ? [{ status: 'loaded' }] : []);
    } };
  }
  return doc;
}
const flagCases = [
  ['web font loaded, one coloured glyph', { fonts: 'loaded', pairWidth: 40, letterWidth: 40, pixels: 600, rgb: [0, 35, 149] }, 'font'],
  ['no @font-face, system draws flags', { fonts: 'empty', pairWidth: 40, letterWidth: 40, pixels: 600, rgb: [237, 41, 57] }, 'native'],
  ['font request fails, system draws flags', { fonts: 'rejects', pairWidth: 40, letterWidth: 40, pixels: 600, rgb: [237, 41, 57] }, 'native'],
  ['fonts.load throws, system draws flags', { fonts: 'throws', pairWidth: 40, letterWidth: 40, pixels: 600, rgb: [237, 41, 57] }, 'native'],
  ['no document.fonts at all, system draws flags', { fonts: 'absent', pairWidth: 40, letterWidth: 40, pixels: 600, rgb: [237, 41, 57] }, 'native'],
  ['two plain letters (Windows): no colour', { fonts: 'empty', pairWidth: 44, letterWidth: 22, pixels: 600, rgb: [0, 0, 0] }, 'none'],
  ['two coloured letter boxes: twice as wide', { fonts: 'loaded', pairWidth: 80, letterWidth: 40, pixels: 900, rgb: [0, 90, 200] }, 'none'],
  ['grey glyph, right width', { fonts: 'loaded', pairWidth: 40, letterWidth: 40, pixels: 600, rgb: [90, 90, 90] }, 'none'],
  ['nothing drawn', { fonts: 'loaded', pairWidth: 40, letterWidth: 40, pixels: 0, rgb: [0, 0, 0] }, 'none'],
  ['a few stray coloured pixels', { fonts: 'loaded', pairWidth: 40, letterWidth: 40, pixels: 20, rgb: [255, 0, 0] }, 'none'],
  ['zero width', { fonts: 'loaded', pairWidth: 0, letterWidth: 0, pixels: 600, rgb: [255, 0, 0] }, 'none'],
  ['canvas throws', { fonts: 'loaded', canvasThrows: true }, 'none'],
  ['no 2d context', { fonts: 'loaded', noContext: true }, 'none'],
  ['font load never settles, system draws flags', { fonts: 'never', fast: true, pairWidth: 40, letterWidth: 40, pixels: 600, rgb: [237, 41, 57] }, 'native']
];
const flagRuns = flagCases.map(([label, opts, want]) => {
  const q = freshQuiz({ setTimeout });
  const doc = fakeDocument(opts);
  const first = q.flagSupport(doc);
  return first.then(got => {
    assert.strictEqual(got, want, label + ': got ' + got);
    if (opts.fonts !== 'absent') { assert.strictEqual(doc.calls.font, "32px 'Atlas Flags'"); assert.strictEqual(doc.calls.text, '\u{1F1EB}\u{1F1F7}'); }
    // Cached once the load settled; asked again after a timeout.
    const again = q.flagSupport(fakeDocument({ fonts: 'loaded', pairWidth: 40, letterWidth: 40, pixels: 600, rgb: [0, 35, 149] }));
    return again.then(second => {
      if (opts.fonts === 'never') assert.strictEqual(second, 'font', label + ': a timed-out answer was cached');
      else assert.strictEqual(second, want, label + ': not cached');
    });
  });
});
const flagNoDoc = Promise.all([Quiz.flagSupport(), Quiz.flagSupport(null), Quiz.flagSupport({})]).then(r => assert.deepStrictEqual(r, ['none', 'none', 'none']));

/* ===== 15. Levels ===== */
group('levels: keys, regions, order, and exactly the askable countries', () => {
  const lv = Quiz.levels(CONTINENTS, FACTS);
  const regions = Object.keys(CONTINENTS).concat('World');
  const slugs = ['africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania', 'world'];
  const kinds = [['capital', 'capitals-'], ['capital-reverse', 'capitals-reverse-'], ['flag', 'flags-'], ['name', 'name-']];
  const wantKeys = [];
  for (const [, prefix] of kinds) for (const s of slugs) wantKeys.push(prefix + s);
  assert.deepStrictEqual(lv.map(l => l.key), wantKeys);
  assert.strictEqual(new Set(lv.map(l => l.key)).size, 28);
  let missing = [];
  try { missing = JSON.parse(fs.readFileSync(path.join(__dirname, 'flags-missing.json'), 'utf8')); } catch (e) { /* checked in the flags test */ }
  const askable = {
    capital: c => Object.prototype.hasOwnProperty.call(FACTS, c),
    'capital-reverse': c => FACTS[c][0].toLowerCase() !== c.toLowerCase(),
    flag: c => !['XS', 'XN', 'SY'].includes(FACTS[c][1]) && !missing.includes(c),
    name: () => true
  };
  let i = 0;
  for (const [kind] of kinds) {
    for (const region of regions) {
      const level = lv[i++];
      assert.strictEqual(level.kind, kind);
      assert.strictEqual(level.region, region);
      const source = region === 'World' ? ALL_NAMES : CONTINENTS[region];
      assert.deepStrictEqual(level.names, source.filter(askable[kind]), level.key);
      assert.strictEqual(new Set(level.names).size, level.names.length, level.key + ' repeats a country');
    }
    // Per kind: the continents partition the world level.
    const world = lv.find(l => l.kind === kind && l.region === 'World').names;
    const parts = [].concat(...lv.filter(l => l.kind === kind && l.region !== 'World').map(l => l.names));
    assert.deepStrictEqual(parts, world, kind + ': continents do not add up to World');
    for (const c of COUNTRIES) assert.strictEqual(world.filter(x => x === c).length, askable[kind](c) ? 1 : 0, kind + ' ' + c);
  }
  // Every level can actually be played with the module.
  for (const level of lv) {
    if (level.kind === 'name') { const m = Quiz.matcher(ENTRIES, { restrictTo: level.names }); for (const c of level.names) assert.strictEqual(m.match(c).name, c); }
    if (level.kind === 'capital') for (const c of level.names) assert.strictEqual(Quiz.capitalChoices(FACTS, c, level.names, Quiz.rng(1)).length, 4);
    if (level.kind === 'capital-reverse') for (const c of level.names) assert(!Quiz.capitalPrompt(FACTS, c).trivial);
    if (level.kind === 'flag') for (const c of level.names) assert(Quiz.flagEmoji(FACTS[c][1]) !== '');
  }
  // Odd inputs.
  assert.deepStrictEqual(Quiz.levels({}, FACTS), []);
  assert.deepStrictEqual(Quiz.levels(null, FACTS), []);
  const odd = Quiz.levels({ 'Middle Earth': ['Gondor', 'France', 'France', 7, null], Nowhere: 'x', Empty: [], 'Two  Words': ['France', 'Djibouti', 'Somaliland'] }, FACTS);
  assert.deepStrictEqual(odd.map(l => l.key + '=' + l.names.join('+')), [
    'capitals-middle-earth=France', 'capitals-two-words=France+Djibouti+Somaliland', 'capitals-world=France+Djibouti+Somaliland',
    'capitals-reverse-middle-earth=France', 'capitals-reverse-two-words=France+Somaliland', 'capitals-reverse-world=France+Somaliland',
    'flags-middle-earth=France', 'flags-two-words=France+Djibouti', 'flags-world=France+Djibouti',
    'name-middle-earth=Gondor+France', 'name-two-words=France+Djibouti+Somaliland', 'name-world=Gondor+France+Djibouti+Somaliland']);
  assert.deepStrictEqual(Quiz.levels(CONTINENTS, null).map(l => l.kind), new Array(7).fill('name'));
  assert.strictEqual(Quiz.slug('North America'), 'north-america');
  return lv.map(l => l.key + ' ' + l.names.length).join(', ');
});

/* ===== 16. Speed ===== */
{
  // 250 entries: the 185 countries plus 65 other names a level could hold.
  const extra = ('Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|' +
    'Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|' +
    'Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|Ontario|Quebec|' +
    'Nova Scotia|New Brunswick|Manitoba|British Columbia|Prince Edward Island|Saskatchewan|Alberta|Newfoundland and Labrador|Yukon|Nunavut|Northwest Territories|' +
    'Queensland|Tasmania|Victoria').split('|');
  const big = ENTRIES.concat(extra.map(name => ({ name, aliases: [] })));
  const t0 = process.hrtime.bigint();
  const m = Quiz.matcher(big, { restrictTo: COUNTRIES });
  const buildMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const rnd = Quiz.rng(1234);
  const sets = {
    'every keystroke of every name (all prefixes)': [],
    'exact names': big.map(e => e.name),
    'one-edit typos (near search)': [],
    'two-edit typos (near search)': [],
    'nonsense of 5-12 letters': [],
    '60-character input': []
  };
  for (const e of big) for (let k = 1; k <= e.name.length; k++) sets['every keystroke of every name (all prefixes)'].push(e.name.slice(0, k));
  for (let i = 0; i < 4000; i++) {
    const name = fold(big[Math.floor(rnd() * big.length)].name);
    const v1 = [...oneEdit(name, ALPHABET)]; const a = v1[Math.floor(rnd() * v1.length)];
    sets['one-edit typos (near search)'].push(a);
    const v2 = [...oneEdit(a, ALPHABET)]; sets['two-edit typos (near search)'].push(v2[Math.floor(rnd() * v2.length)]);
    let s = ''; for (let k = 5 + Math.floor(rnd() * 8); k > 0; k--) s += ALPHABET[Math.floor(rnd() * 26)];
    sets['nonsense of 5-12 letters'].push(s);
  }
  for (let i = 0; i < 500; i++) { let s = ''; while (s.length < 60) s += ALPHABET[Math.floor(rnd() * 27)]; sets['60-character input'].push(s.slice(0, 60)); }
  sets['60-character input'].push('saint vincent and the grenadinez', 'democratic republic of the kongo', 'turkish republic of northern cyprus x'.slice(0, 60));
  for (const key of Object.keys(sets)) for (const s of sets[key]) m.match(s);   // warm up
  let worstMean = 0, worstMax = 0;
  const lines = [];
  for (const key of Object.keys(sets)) {
    const inputs = sets[key];
    const reps = QUICK ? 3 : 12;
    let total = 0n, max = 0;
    for (let r = 0; r < reps; r++) {
      for (const s of inputs) {
        const a = process.hrtime.bigint();
        m.match(s);
        const d = process.hrtime.bigint() - a;
        total += d;
        if (r > 0 && Number(d) > max) max = Number(d);
      }
    }
    const mean = Number(total) / (reps * inputs.length) / 1000;
    worstMean = Math.max(worstMean, mean);
    worstMax = Math.max(worstMax, max / 1000);
    lines.push(key + ': mean ' + mean.toFixed(2) + ' µs, slowest single call ' + (max / 1000).toFixed(0) + ' µs (' + inputs.length + ' inputs)');
  }
  check('speed: matcher on ' + big.length + ' entries is well under 1 ms per call', worstMean < 100 && buildMs < 250,
    'slowest class mean ' + worstMean.toFixed(2) + ' µs; slowest single call seen ' + worstMax.toFixed(0) + ' µs (includes timer and GC noise); build ' + buildMs.toFixed(1) + ' ms');
  lines.forEach(info);
  // capitalChoices and levels are not on a hot path, but they should not be slow either.
  const a = process.hrtime.bigint();
  let k = 0;
  for (let i = 0; i < 20; i++) for (const c of COUNTRIES) { Quiz.capitalChoices(FACTS, c, CONTINENTS[continentOf.get(c)], Quiz.rng(i)); k++; }
  const per = Number(process.hrtime.bigint() - a) / k / 1000;
  const b = process.hrtime.bigint();
  Quiz.levels(CONTINENTS, FACTS);
  const lvMs = Number(process.hrtime.bigint() - b) / 1e6;
  check('speed: capitalChoices and levels', per < 500 && lvMs < 100, 'capitalChoices ' + per.toFixed(1) + ' µs per call; levels() ' + lvMs.toFixed(2) + ' ms');
}

Promise.all(flagRuns.concat(flagNoDoc)).then(
  () => check('flags: flagSupport decides font / native / none and caches (' + flagCases.length + ' stand-in documents)', true, flagCases.map(c => c[2]).join(', ')),
  e => check('flags: flagSupport decides font / native / none and caches', false, e.message.split('\n')[0])
).then(() => {
  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
});
