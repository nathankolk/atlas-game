// The mastery module pasted into index.html must be byte-identical to work/mastery/mastery.js
'use strict';
const fs = require('fs');
const html = fs.readFileSync('/home/user/atlas-game/public/index.html', 'utf8');
const file = fs.readFileSync(__dirname + '/../../mastery/mastery.js', 'utf8');
const START = '/* =========================================================\n * MASTERY (per-item learning history';
const END = '/* ===== END OF MASTERY MODULE ===== */';
const a = html.indexOf(START), b = html.indexOf(END);
if (a < 0 || b < 0 || html.indexOf(START, a + 1) >= 0) { console.log('FAIL markers not found exactly once'); process.exit(1); }
const pasted = html.slice(a, b);
if (pasted !== file) { console.log('FAIL pasted copy differs from mastery.js (' + pasted.length + ' vs ' + file.length + ' chars)'); process.exit(1); }
console.log('PASS pasted mastery module is byte-identical to mastery.js (' + file.length + ' chars)');
