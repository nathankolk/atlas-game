// Loads the data files the tests share: WORLD_FACTS, COUNTRY_TYPED_ALIASES and the game's continents.
'use strict';
const fs = require('fs');
const path = require('path');
const DATA = path.join(__dirname, '..', 'data');
const src = fs.readFileSync(path.join(DATA, 'world-facts.js'), 'utf8');
const data = new Function(src + '\nreturn { WORLD_FACTS: WORLD_FACTS, COUNTRY_TYPED_ALIASES: COUNTRY_TYPED_ALIASES };')();
data.CONTINENTS = JSON.parse(fs.readFileSync(path.join(DATA, 'game-countries.json'), 'utf8')).continents;
data.source = src;
module.exports = data;
