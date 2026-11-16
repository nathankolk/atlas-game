// Makes a servable copy of the app's public/ folder with the test hook added, for builds that
// do not expose window.__atlas yet (PLAN.md section 6). The repo itself is never touched.
//
//   node make-test-copy.js [--src=<public dir>] [--out=<dir>] [--mastery]
//
// --mastery also pastes $S/work/mastery/mastery.js into the copy and wires it to the game the
// way PLAN.md section 4 describes (one record per resolved question, one session per finished
// round, Learn quizzes not recorded). That wiring is a stand-in used only to exercise the
// suite's mastery check before the real integration exists.
//
// As a module: require('./make-test-copy.js').makeCopy({ src, out, mastery }) -> out dir.
'use strict';

const fs = require('fs');
const path = require('path');

const SCRATCH = path.resolve(__dirname, '..');
const REPO_PUBLIC = '/home/user/atlas-game/public';
const HOOK_RE = /window\.__atlas\s*=/;

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name), d = path.join(dst, ent.name);
    if (ent.isDirectory()) copyDir(s, d);
    else if (ent.isFile()) fs.copyFileSync(s, d);
  }
}

// Insert `code` just before the IIFE's final init() call
function beforeInit(html, code) {
  const m = /\n(\s*)init\(\);\s*\n\s*\}\)\(\);\s*\n\s*<\/script>/.exec(html);
  if (!m) throw new Error('make-test-copy: could not find the final init() call of the script');
  return html.slice(0, m.index) + '\n' + code + html.slice(m.index);
}

function makeCopy(opts) {
  opts = opts || {};
  const src = path.resolve(opts.src || REPO_PUBLIC);
  const out = path.resolve(opts.out || path.join(__dirname, opts.mastery ? 'app-copy-mastery' : 'app-copy'));
  fs.rmSync(out, { recursive: true, force: true });
  copyDir(src, out);
  const file = path.join(out, 'index.html');
  let html = fs.readFileSync(file, 'utf8');
  const hadHook = HOOK_RE.test(html);

  if (opts.mastery && !/Mastery\.create\(/.test(html)) {
    const masteryJs = fs.readFileSync(path.join(SCRATCH, 'work', 'mastery', 'mastery.js'), 'utf8');
    // Every resolved question pushes its points onto state.sequence: record there
    const pushes = html.match(/state\.sequence\.push\(([^)]+)\);/g) || [];
    if (pushes.length < 5) throw new Error('make-test-copy: expected the state.sequence.push sites, found ' + pushes.length);
    html = html.replace(/state\.sequence\.push\(([^)]+)\);/g, 'state.sequence.push($1); __testRecord($1);');
    // Pin the City scores by distance, not by tries
    html = html.replace(/(state\.pin\.results\.push\(\{ name: city\.name, km: km, pts: pts \}\);)/,
      '$1 __testRecordPin(city.name, pts);');
    // A finished round is one session
    html = html.replace(/(\n\s*switchScreen\('results'\);\n\s*\}\n\n\s*\/\/ Shows a "New Record!" banner)/,
      '\n    __testSession();$1');
    html = html.replace(/(function finishPinGame\(\) \{)/, '$1\n    __testSession();');
    html = html.replace(/(function learnLevelPassed\(\) \{)/, '$1\n    __testSession();');
    const wiring = [
      masteryJs.replace(/\n\/\/ Lets node load this file[\s\S]*$/, '\n'),
      '  const mastery = Mastery.create();',
      '  function __testSkill() {',
      "    const m = state.gameMode;",
      "    if (m === 'world-country' || m === 'daily-five') return 'country';",
      "    if (m === 'us-state') return 'us-state';",
      "    if (m === 'us-capital-to-state' || m === 'us-state-to-capital') return 'us-capital';",
      "    if (m === 'us-city') return 'us-city';",
      "    if (m === 'province') return 'province:' + PROVINCE_ROUNDS[state.currentProvinceRound].country;",
      "    return m;",
      '  }',
      '  function __testRecord(points) {',
      '    if (state.learn) return;',
      '    mastery.record(__testSkill(), state.current, Mastery.OUTCOMES[points]);',
      '  }',
      '  function __testRecordPin(name, pts) {',
      "    mastery.record('city-pin', name, pts >= 80 ? 'first' : pts >= 40 ? 'second' : 'miss');",
      '  }',
      '  function __testSession() {',
      '    const first = state.sequence.filter(p => p === 2).length;',
      '    mastery.recordSession({ questions: state.totalQuestions, firstTry: first,',
      '      seconds: Math.round((Date.now() - state.startTime) / 1000) });',
      '  }',
      ''
    ].join('\n');
    html = beforeInit(html, wiring);
  }

  if (!hadHook) {
    const hasMastery = /const mastery = Mastery\.create\(/.test(html);
    html = beforeInit(html, '  window.__atlas = { state, ' + (hasMastery ? 'mastery, ' : '') + 'startGame, version: 1 };\n');
  }
  fs.writeFileSync(file, html);
  return { out, hadHook };
}

module.exports = { makeCopy, HOOK_RE };

if (require.main === module) {
  const arg = (name) => {
    const a = process.argv.find(x => x.startsWith('--' + name + '='));
    return a ? a.slice(name.length + 3) : undefined;
  };
  const r = makeCopy({ src: arg('src'), out: arg('out'), mastery: process.argv.includes('--mastery') });
  console.log((r.hadHook ? 'copied (hook already present): ' : 'copied and added the test hook: ') + r.out);
}
