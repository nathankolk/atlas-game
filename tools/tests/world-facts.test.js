'use strict';
// Verifies the WORLD FACTS section of public/index.html against the page's own country list.
//   node tools/tests/world-facts.test.js
// Exits 1 if any check fails. Needs nothing but Node (region names come from Node's built-in CLDR data).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadGameCountries } = require('./game-data.js');
const extract = require('./extract.js');


// Places with no ISO 3166-1 code. Their codes must come from ISO's user-assigned block and must not
// name any region CLDR knows, so they can never be drawn as some other place's flag.
const PRIVATE_USE = { 'Somaliland': 'XS', 'Northern Cyprus': 'XN' };

// CLDR's English region name for a code, where it differs from the game's name by more than
// "&"/"and" or "St."/"Saint". A code whose CLDR name matches neither is a wrong code.
const CLDR_NAMES = {
  'Democratic Republic of the Congo': ['Congo - Kinshasa'],
  'Republic of the Congo': ['Congo - Brazzaville'],
  'Ivory Coast': ['Côte d’Ivoire', "Côte d'Ivoire"],
  'Czech Republic': ['Czechia'],
  'Myanmar': ['Myanmar (Burma)'],
  'Palestine': ['Palestinian Territories', 'Palestine'],
  'Turkey': ['Türkiye'],
  'Saint Vincent and the Grenadines': ['St. Vincent & Grenadines'],
  'Falkland Islands': ['Falkland Islands (Islas Malvinas)']
};

// The only capital names allowed to appear under two countries.
const SHARED_CAPITALS = {
  'nicosia': ['Cyprus', 'Northern Cyprus'],
  'jerusalem': ['Israel', 'Palestine']
};

// Capitals whose name contains another country's capital as whole words. In a list of choices the two
// read as one place, so a quiz must never offer them together; a pair missing from this list fails.
const NESTED_CAPITALS = [
  ['Nicosia', 'North Nicosia'],
  ['Jerusalem', 'East Jerusalem'],
  ['La Paz', 'Ciudad de la Paz']
];

const errors = [];
const fail = msg => errors.push(msg);

// Lower-case with accents stripped: the folding the typed-answer matcher applies.
function fold(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Folds a name further for comparing against CLDR: "&" and "St." spelled out, punctuation dropped.
function looseName(s) {
  return fold(s).replace(/&/g, 'and').replace(/\bst\.?\s/g, 'saint ').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Every way a forgiving typed-answer matcher might fold a name. All of them lower-case and strip
// accents. Punctuation is deleted ('delete'), turned into a space ('space'), or dropped along with
// the spaces ('squash'); "&" and "St." may be spelled out; a leading "the" may be ignored.
const TYPED_FOLDS = [];
for (const punct of ['delete', 'space', 'squash']) {
  for (const spellOut of [false, true]) {
    for (const dropThe of [false, true]) TYPED_FOLDS.push({ punct, spellOut, dropThe });
  }
}

// The key a typed name is looked up by under one of TYPED_FOLDS.
function typedKey(s, how) {
  let t = fold(s);
  if (how.spellOut) t = t.replace(/&/g, ' and ').replace(/\bst\b\.?/g, 'saint');
  t = how.punct === 'delete' ? t.replace(/[^a-z0-9\s]/g, '') : t.replace(/[^a-z0-9]+/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (how.dropThe) t = t.replace(/^the /, '');
  return how.punct === 'squash' ? t.replace(/ /g, '') : t;
}

// True when the words of `inner` appear, in order and unbroken, inside `outer`.
function isWordRun(inner, outer) {
  return inner !== outer && (' ' + outer + ' ').includes(' ' + inner + ' ');
}

function isCleanString(s) {
  return typeof s === 'string' && s.length > 0 && s === s.trim() && !/\s{2,}/.test(s) && s === s.normalize('NFC');
}

function inUserAssignedBlock(code) {
  return code === 'AA' || code === 'ZZ' || /^Q[M-Z]$/.test(code) || /^X[A-Z]$/.test(code);
}

const { countries } = loadGameCountries();
const source = extract.source('world-facts');
const { WORLD_FACTS, COUNTRY_TYPED_ALIASES } =
  vm.runInNewContext(source + '\n;({ WORLD_FACTS, COUNTRY_TYPED_ALIASES });');

if (source !== source.normalize('NFC')) fail('world-facts.js is not NFC-normalised');

/* ===== Coverage: every game country, nothing else ===== */
const gameSet = new Set(countries);
const factKeys = Object.keys(WORLD_FACTS);
countries.filter(n => !(n in WORLD_FACTS)).forEach(n => fail('missing entry: ' + n));
factKeys.filter(n => !gameSet.has(n)).forEach(n => fail('extra key not in the game: ' + n));
checkNoRepeatedKeys('WORLD_FACTS', factKeys.length);
checkNoRepeatedKeys('COUNTRY_TYPED_ALIASES', Object.keys(COUNTRY_TYPED_ALIASES).length);

// A key written twice in an object literal silently keeps the last one, so count the keys as written.
function checkNoRepeatedKeys(constName, keptCount) {
  const start = source.indexOf('const ' + constName + ' = {');
  const block = source.slice(start, source.indexOf('\n};', start));
  const written = (block.match(/^\s{2}(['"]).+?\1:\s*\[/gm) || []).length;
  if (written !== keptCount) fail(constName + ' has a repeated key (' + written + ' written, ' + keptCount + ' kept)');
}

/* ===== Entry shape, capitals, codes ===== */
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const codeOwner = new Map();
const capitalOwners = new Map();
const claimCapital = (city, country) => {
  const key = fold(city);
  if (!capitalOwners.has(key)) capitalOwners.set(key, []);
  capitalOwners.get(key).push(country);
};

for (const name of factKeys) {
  const entry = WORLD_FACTS[name];
  if (!Array.isArray(entry) || entry.length < 2 || entry.length > 3) { fail(name + ': entry must be [capital, code] or [capital, code, [others]]'); continue; }
  const [capital, code, others] = entry;

  if (!isCleanString(capital)) fail(name + ': capital must be a non-empty, trimmed string');
  else claimCapital(capital, name);

  if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) fail(name + ': code must be 2 upper-case letters, got ' + JSON.stringify(code));
  else {
    if (codeOwner.has(code)) fail(name + ': code ' + code + ' is already used by ' + codeOwner.get(code));
    codeOwner.set(code, name);
    const cldr = regionNames.of(code);
    if (PRIVATE_USE[name]) {
      if (code !== PRIVATE_USE[name]) fail(name + ': expected private-use code ' + PRIVATE_USE[name] + ', got ' + code);
      if (!inUserAssignedBlock(code)) fail(name + ': ' + code + ' is outside ISO\'s user-assigned block');
      if (cldr !== code) fail(name + ': private-use code ' + code + ' is a real region (' + cldr + ')');
    } else if (cldr === code) {
      fail(name + ': ' + code + ' is not a region code CLDR knows');
    } else if (looseName(cldr) !== looseName(name) && !(CLDR_NAMES[name] || []).includes(cldr)) {
      fail(name + ': code ' + code + ' belongs to "' + cldr + '"');
    }
  }

  if (others !== undefined) {
    if (!Array.isArray(others) || others.length === 0) fail(name + ': the alternates list must be a non-empty array or be left out');
    else {
      const seen = new Set([fold(String(capital))]);
      for (const city of others) {
        if (!isCleanString(city)) { fail(name + ': alternate capital must be a non-empty, trimmed string'); continue; }
        if (seen.has(fold(city))) fail(name + ': alternate "' + city + '" repeats another capital of the same country');
        seen.add(fold(city));
        claimCapital(city, name);
      }
    }
  }
}

for (const [city, owners] of capitalOwners) {
  if (owners.length < 2) continue;
  const allowed = SHARED_CAPITALS[city];
  if (!allowed || owners.length !== allowed.length || !owners.every(o => allowed.includes(o))) {
    fail('capital "' + city + '" appears under ' + owners.join(' and '));
  }
}

// Capital names nested inside another country's capital must be exactly the listed pairs.
const cityWords = s => fold(s).replace(/[^a-z0-9]+/g, ' ').trim();
const allCapitals = [];
for (const name of factKeys) {
  const entry = WORLD_FACTS[name];
  if (!Array.isArray(entry)) continue;
  [entry[0]].concat(Array.isArray(entry[2]) ? entry[2] : [])
    .filter(c => typeof c === 'string')
    .forEach(c => allCapitals.push({ city: c, country: name, words: cityWords(c) }));
}
const nestedFound = new Set();
for (const a of allCapitals) {
  for (const b of allCapitals) {
    if (a.country !== b.country && isWordRun(a.words, b.words)) nestedFound.add(a.words + '|' + b.words);
  }
}
const nestedExpected = new Set(NESTED_CAPITALS.map(([inner, outer]) => cityWords(inner) + '|' + cityWords(outer)));
for (const pair of nestedFound) {
  if (!nestedExpected.has(pair)) fail('capital "' + pair.split('|')[0] + '" sits inside "' + pair.split('|')[1] + '" and the pair is not in NESTED_CAPITALS');
}
for (const pair of nestedExpected) {
  if (!nestedFound.has(pair)) fail('NESTED_CAPITALS lists "' + pair.replace('|', '" inside "') + '" but the data has no such pair');
}

/* ===== Typed aliases ===== */
const canonicalFolded = new Map(countries.map(n => [fold(n), n]));
const aliasOwner = new Map();
let aliasCount = 0;
for (const name of Object.keys(COUNTRY_TYPED_ALIASES)) {
  if (!gameSet.has(name)) { fail('alias key not in the game: ' + name); continue; }
  const list = COUNTRY_TYPED_ALIASES[name];
  if (!Array.isArray(list) || list.length === 0) { fail(name + ': alias list must be a non-empty array'); continue; }
  for (const alias of list) {
    aliasCount++;
    if (!isCleanString(alias)) { fail(name + ': alias must be a non-empty, trimmed string'); continue; }
    if (alias !== fold(alias) || /[^\x20-\x7e]/.test(alias)) fail(name + ': alias "' + alias + '" must be lower-case ASCII');
    if (canonicalFolded.has(alias)) {
      fail(name + ': alias "' + alias + '" is the game\'s name for ' + canonicalFolded.get(alias));
    }
    if (aliasOwner.has(alias)) fail('alias "' + alias + '" is listed under ' + aliasOwner.get(alias) + ' and ' + name);
    aliasOwner.set(alias, name);
  }
}

/* ===== Typed names: one country per spelling, however the matcher folds ===== */
// No alias may equal another country's canonical name or alias once case, accents and punctuation
// are gone. Checked under every fold in TYPED_FOLDS, canonical names included, so the answer holds
// whichever of them the game's matcher ends up using.
const spellings = countries.map(n => ({ text: n, country: n, kind: 'name' }));
for (const name of Object.keys(COUNTRY_TYPED_ALIASES)) {
  const list = COUNTRY_TYPED_ALIASES[name];
  if (!Array.isArray(list)) continue;
  list.filter(a => typeof a === 'string').forEach(a => spellings.push({ text: a, country: name, kind: 'alias' }));
}
const clashesSeen = new Set();
for (const how of TYPED_FOLDS) {
  const keyOwner = new Map();
  for (const s of spellings) {
    const key = typedKey(s.text, how);
    if (!key) {
      if (!clashesSeen.has(s.text)) fail(s.country + ': ' + s.kind + ' "' + s.text + '" has no letters or digits');
      clashesSeen.add(s.text);
      continue;
    }
    const first = keyOwner.get(key);
    if (!first) { keyOwner.set(key, s); continue; }
    if (first.country === s.country) continue;
    const id = first.country + '|' + first.text + '|' + s.country + '|' + s.text;
    if (clashesSeen.has(id)) continue;
    clashesSeen.add(id);
    fail(s.kind + ' "' + s.text + '" (' + s.country + ') reads the same as ' + first.kind + ' "' + first.text + '" (' +
      first.country + ') once case, accents and punctuation are dropped: both become "' + key + '"');
  }
}

/* ===== Report ===== */
const withAlternates = factKeys.filter(n => WORLD_FACTS[n][2]);
console.log('game countries: ' + countries.length);
console.log('WORLD_FACTS entries: ' + factKeys.length + ' (' + withAlternates.length + ' with alternate capitals)');
console.log('COUNTRY_TYPED_ALIASES: ' + Object.keys(COUNTRY_TYPED_ALIASES).length + ' countries, ' + aliasCount + ' spellings');
console.log('typed spellings checked: ' + spellings.length + ' (names and aliases) under ' + TYPED_FOLDS.length + ' ways of folding');
console.log('never offer together: ' + NESTED_CAPITALS.map(p => p.join(' / ')).join('; '));
if (errors.length) {
  console.log('\nFAILED (' + errors.length + '):');
  errors.forEach(e => console.log('  - ' + e));
  process.exit(1);
}
console.log('\nOK: every game country has an entry, no extra keys, codes are 2 upper-case letters and unique,');
console.log('    codes name the right country, capitals are clean and unambiguous, aliases do not collide,');
console.log('    and no typed spelling reaches two countries once case, accents and punctuation are dropped.');
