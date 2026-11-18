// What the module tests need from the game itself, read straight from
// public/index.html: WORLD_FACTS and COUNTRY_TYPED_ALIASES (the WORLD FACTS
// section) and the country list by continent (the CONTINENTS literal).
'use strict';
const fs = require('fs');
const vm = require('vm');
const extract = require('./extract.js');

// Returns the source text of the object literal that follows `const CONTINENTS =`.
function continentsLiteral(html) {
  const start = html.search(/const\s+CONTINENTS\s*=\s*\{/);
  if (start < 0) throw new Error('CONTINENTS constant not found');
  const open = html.indexOf('{', start);
  let depth = 0;
  let quote = null;
  for (let i = open; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') quote = ch;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return html.slice(open, i + 1);
  }
  throw new Error('CONTINENTS literal is not closed');
}

// Returns { continents: {name: [countries]}, countries: [unique names in file order], duplicates }.
function loadGameCountries() {
  const html = fs.readFileSync(extract.PAGE, 'utf8');
  // Through JSON, so the arrays are this realm's own (deepStrictEqual compares prototypes)
  const continents = JSON.parse(JSON.stringify(vm.runInNewContext('(' + continentsLiteral(html) + ')')));
  const countries = [];
  const seen = new Set();
  const duplicates = [];
  for (const region of Object.keys(continents)) {
    for (const name of continents[region]) {
      if (seen.has(name)) duplicates.push(name);
      else { seen.add(name); countries.push(name); }
    }
  }
  return { continents, countries, duplicates };
}

const source = extract.source('world-facts');
const data = new Function(source + '\nreturn { WORLD_FACTS: WORLD_FACTS, COUNTRY_TYPED_ALIASES: COUNTRY_TYPED_ALIASES };')();
data.CONTINENTS = loadGameCountries().continents;
data.source = source;
data.loadGameCountries = loadGameCountries;
module.exports = data;
