'use strict';
// Proves the checks can fail: builds copies of the app with one behaviour broken (or one bug
// fixed) and runs the checks that should notice.   node mutants.js [id ...]
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const BASE = path.join(__dirname, '..', 'app-copy-mastery');
const OUT = path.join(__dirname, 'mutants');

const rep = (from, to) => html => {
  if (typeof from === 'string' ? html.indexOf(from) === -1 : !from.test(html)) throw new Error('pattern not found: ' + from);
  return html.replace(from, to);
};
const MUTANTS = [
  { id: 'no-clean-sweep-time', only: 'continent-perfect,provinces-learn', expect: 'FAIL FAIL',
    edit: rep('if (session.correct === session.totalQuestions && session.totalQuestions > 0) {', 'if (false) {') },
  { id: 'practice-writes-records', only: 'wrong-and-skip', expect: 'FAIL',
    edit: rep('const isPractice = state.practice || !!state.dailyReplay;', 'const isPractice = !!state.dailyReplay;') },
  { id: 'second-try-full-points', only: 'wrong-and-skip,us-modes,daily', expect: 'FAIL FAIL FAIL',
    edit: html => html.split('const pointsEarned = state.attempts === 0 ? 2 : 1;').join('const pointsEarned = 2;') },
  { id: 'daily-replayable', only: 'daily,persistence', expect: 'FAIL FAIL',
    edit: rep("      if (existing) {\n        showDailyAlreadyPlayed(existing, dateKey);", "      if (false) {\n        showDailyAlreadyPlayed(existing, dateKey);") },
  { id: 'learn-miss-no-restart', only: 'provinces-learn', expect: 'FAIL',
    edit: rep('if (state.attempts >= 2 || state.learn) {', 'if (state.attempts >= 2) {') },
  { id: 'pin-not-saved', only: 'pin', expect: 'FAIL',
    edit: rep(/function savePinStore\(st\) \{/, 'function savePinStore(st) { return;') },
  { id: 'console-error-on-boot', only: 'boot,world', expect: 'FAIL FAIL',
    edit: rep('      renderMenu();\n      openLinkedLevel();', "      console.error('boom');\n      renderMenu();\n      openLinkedLevel();") },
  { id: 'page-error-in-round', only: 'world,continent-perfect', expect: 'FAIL FAIL',
    edit: rep("    updateStats();\n    document.getElementById('skip-btn').disabled = false;", "    updateStats();\n    document.getElementById('skip-btn').disabled = false;\n    if (state.sequence.length === 2) setTimeout(() => { throw new Error('boom'); }, 0);") },
  { id: 'load-drops-legacy-keys', only: 'persistence', expect: 'FAIL',
    edit: rep('      renderMenu();\n      openLinkedLevel();', "      (function () { const r = loadAllRecords(); Object.keys(r).forEach(k => { if (k.split('|').length !== 3) delete r[k]; }); saveAllRecords(r); })();\n      renderMenu();\n      openLinkedLevel();") },
  { id: 'records-key-renamed', only: 'persistence,continent-perfect', expect: 'FAIL PASS',
    edit: rep("    return { mode: 'world-country', region: regionOrMode };", "    return { mode: 'world-country', region: regionOrMode === 'Oceania' ? 'Oceania & Pacific' : regionOrMode };") },
  { id: 'learn-records-mastery', only: 'mastery', expect: 'FAIL',
    edit: rep('    if (state.learn) return;\n    mastery.record(', '    mastery.record(') },
  { id: 'mastery-wrong-skill', only: 'mastery', expect: 'FAIL',
    edit: rep("return 'province:' + PROVINCE_ROUNDS[state.currentProvinceRound].country;", "return 'province';") },
  { id: 'no-session-recorded', only: 'mastery', expect: 'FAIL',
    edit: rep(/function __testSession\(\) \{/, 'function __testSession() { return;') },
  { id: 'ignores-difficulty', only: 'difficulty-satellite', expect: 'FAIL',
    edit: rep("    state.difficulty = d;", "    state.difficulty = 'normal';") },
  { id: 'no-tiles-requested', only: 'difficulty-satellite', expect: 'FAIL',
    edit: rep("'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/'", "'/no-such-tiles/'") },
  { id: 'back-does-nothing', only: 'world', expect: 'FAIL',
    edit: rep("document.getElementById('back-btn').addEventListener('click', () => switchScreen('menu'));", "document.getElementById('back-btn').addEventListener('click', () => {});") },
  { id: 'hook-missing', only: 'boot,world', expect: 'FAIL FAIL',
    edit: rep(/\n\s*window\.__atlas = \{[^\n]*\n/, '\n') },
  // The two known bugs, fixed: the checks that fail today must pass
  { id: 'fixed-stale-timer', only: 'stale-timer', expect: 'PASS',
    edit: html => {
      html = rep("    state.startArg = regionOrMode;\n    state.practice = false;", "    state.gameId = (state.gameId || 0) + 1;\n    state.startArg = regionOrMode;\n    state.practice = false;")(html);
      html = rep("    if (name === 'menu') {\n      renderMenu();", "    if (name === 'menu') {\n      state.gameId = (state.gameId || 0) + 1;\n      renderMenu();")(html);
      html = rep("    const learnRun = state.learn;\n    setTimeout(() => {\n      targetPath.classed('reveal', false);", "    const learnRun = state.learn;\n    const gameId = state.gameId;\n    setTimeout(() => {\n      if (state.gameId !== gameId) return;\n      targetPath.classed('reveal', false);")(html);
      return html;
    } },
  { id: 'fixed-bad-links', only: 'bad-links', expect: 'PASS',
    edit: rep("    const startArg = linkSlugs()[slug];\n    if (!startArg) {", "    let startArg = linkSlugs()[slug];\n    if (startArg && US_CITY_REGION_KEYS[startArg] && !(US_CITIES_BY_REGION[US_CITY_REGION_KEYS[startArg]] || []).length) startArg = null;\n    if (!startArg) {") }
];

const want = process.argv.slice(2);
let bad = 0;
for (const m of MUTANTS) {
  if (want.length && want.indexOf(m.id) === -1) continue;
  const dir = path.join(OUT, m.id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.cpSync(BASE, dir, { recursive: true });
  const file = path.join(dir, 'index.html');
  fs.writeFileSync(file, m.edit(fs.readFileSync(file, 'utf8')));
  const r = spawnSync('node', [path.join(__dirname, '..', 'smoke.js'), '--root=' + dir, '--only=' + m.only],
    { encoding: 'utf8', env: Object.assign({}, process.env, { NODE_PATH: '/opt/node-tools/node_modules' }) });
  const lines = r.stdout.split('\n');
  const got = lines.filter(l => /^(PASS|FAIL|SKIP)  /.test(l)).map(l => l.slice(0, 4)).join(' ');
  const ok = got === m.expect;
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'BAD  ') + m.id.padEnd(26) + ' ' + m.only + ' -> ' + got + (ok ? '' : '   (expected ' + m.expect + ')') + '  exit ' + r.status);
  lines.filter(l => /^      - /.test(l)).slice(0, ok ? 3 : 12).forEach(l => console.log('        ' + l.trim().slice(0, 230)));
  if (r.stderr.trim()) console.log('        stderr: ' + r.stderr.trim().split('\n')[0]);
  fs.rmSync(dir, { recursive: true, force: true });
}
process.exit(bad ? 1 : 0);
