// Lists accepted near matches in which a typo produced a different REAL geographic word (a word found in
// another accepted spelling, a decoy, or a compass word), so a human can judge each one.
// Run: node scan-words.js
'use strict';
const Quiz = require('./quiz.js');
const { WORLD_FACTS: FACTS, COUNTRY_TYPED_ALIASES: ALIASES } = require('./load-data.js');
const fold = Quiz.fold;
const COUNTRIES = Object.keys(FACTS);
const M = Quiz.matcher(Quiz.entries(COUNTRIES, ALIASES));
const SPELLINGS = [];
for (const c of COUNTRIES) for (const raw of [c].concat(ALIASES[c] || [])) SPELLINGS.push([fold(raw), c]);
const ownWords = new Map();
for (const [f, c] of SPELLINGS) { if (!ownWords.has(c)) ownWords.set(c, new Set()); f.split(' ').forEach(w => ownWords.get(c).add(w)); }
const vocab = new Set('north south east west northern southern eastern western central upper lower new old great greater little island islands isle republic kingdom city land lands sea ocean coast cape port bay gulf lake river mount saint san santa'.split(' '));
for (const [f] of SPELLINGS) f.split(' ').forEach(w => vocab.add(w));
for (const d of Quiz.DECOYS) fold(d).split(' ').forEach(w => vocab.add(w));
for (const c of COUNTRIES) for (const city of [FACTS[c][0]].concat(FACTS[c][2] || [])) fold(city).split(' ').forEach(w => vocab.add(w));
for (const w of ['of', 'and', 'the', 'de', 'la', 'el', 'dr', 'us', 'uk', 'nz', 'car', 'pdr']) vocab.delete(w);
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz ';
function oneEdit(s) {
  const out = new Set();
  for (let i = 0; i < s.length; i++) out.add(s.slice(0, i) + s.slice(i + 1));
  for (let i = 0; i <= s.length; i++) for (const ch of ALPHABET) out.add(s.slice(0, i) + ch + s.slice(i));
  for (let i = 0; i < s.length; i++) for (const ch of ALPHABET) if (ch !== s[i]) out.add(s.slice(0, i) + ch + s.slice(i + 1));
  for (let i = 0; i + 1 < s.length; i++) out.add(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2));
  out.delete(s);
  return out;
}
const found = new Map();
function look(v, c) {
  const r = M.match(v);
  if (!r || r.exact || r.name !== c) return;
  const f = fold(v);
  const odd = f.split(' ').filter(w => w.length >= 3 && vocab.has(w) && !ownWords.get(c).has(w));
  if (odd.length) found.set(f, c + ' [' + odd.join(',') + ']');
}
const rnd = Quiz.rng(31337);
for (const [s, c] of SPELLINGS) {
  const first = [...oneEdit(s)];
  for (const v of first) look(v, c);
  // Two edits: every second edit of a sample of first edits (exhaustive would be 30 million).
  if (s.length >= 10) for (let t = 0; t < 400; t++) for (const v of oneEdit(first[Math.floor(rnd() * first.length)])) look(v, c);
}
console.log(found.size + ' accepted inputs contain a real word that is not part of that country\'s names:');
console.log([...found].map(([v, c]) => v + ' → ' + c).sort().join('\n'));
