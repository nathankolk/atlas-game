// Runs the tests of the self-contained modules inside public/index.html.
//
//   node tools/tests/run.js            mastery (two suites), quiz, world facts: Node only
//   node tools/tests/run.js --globe    the globe engine as well, in headless Chromium
//                                      (needs Playwright, see globe/harness.js; slow
//                                      without a GPU)
//   node tools/tests/run.js --quick    smaller samples in the quiz suite
//
// Each test loads its module out of the page (extract.js), so what is tested
// is what the site serves. After changing a module in public/index.html, run
// this before committing. Exits non-zero if any suite fails.
'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const suites = [
  ['world facts', 'world-facts.test.js', []],
  ['quiz', 'quiz.test.js', args.includes('--quick') ? ['--quick'] : []],
  ['mastery', 'mastery.test.js', []],
  ['mastery, across time zones', 'mastery-zones.test.js', []]
];
if (args.includes('--globe')) suites.push(['globe engine', 'globe.test.js', []]);

let failed = 0;
suites.forEach(([name, file, extra]) => {
  const started = Date.now();
  const run = spawnSync(process.execPath, [path.join(__dirname, file)].concat(extra), { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
  const lines = (run.stdout || '').split('\n').filter(line => line.trim());
  const ok = run.status === 0;
  if (!ok) failed++;
  // The suite's own last line is its tally
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + '  (' + ((Date.now() - started) / 1000).toFixed(1) + ' s)  ' + (lines[lines.length - 1] || '').trim().slice(0, 100));
  if (!ok) {
    lines.filter(line => /^FAIL/.test(line)).slice(0, 20).forEach(line => console.log('      ' + line.slice(0, 300)));
    if (run.stderr) console.log(run.stderr.split('\n').slice(0, 12).join('\n'));
  }
});
console.log(failed ? failed + ' suite(s) failed' : 'all ' + suites.length + ' suites passed');
process.exit(failed ? 1 : 0);
