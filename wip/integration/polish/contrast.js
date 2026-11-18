// Contrast of text and of meaningful marks, from the tokens in public/index.html, in both themes.
//   node contrast.js [--all]     prints failures (and with --all every pair); exits 1 on a failure
'use strict';
const fs = require('fs');
const html = fs.readFileSync('/home/user/atlas-game/public/index.html', 'utf8');
const ALL = process.argv.includes('--all');

function block(selector) {
  const at = html.indexOf('\n  ' + selector + ' {');
  if (at < 0) throw new Error('no block ' + selector);
  const end = html.indexOf('\n  }', at);
  const out = {};
  html.slice(at, end).replace(/(--[a-z0-9-]+):\s*([^;]+);/g, (m, k, v) => { out[k] = v.trim(); });
  return out;
}
const light = block(':root');
const dark = Object.assign({}, light, block('[data-theme="dark"]'));
const onDark = block('.daily, .app-notice');
const sat = block('.stage.sat-on');

function parse(v, tokens) {
  v = v.trim();
  const ref = v.match(/^var\((--[a-z0-9-]+)\)$/);
  if (ref) return parse(tokens[ref[1]], tokens);
  if (v[0] === '#') {
    const h = v.slice(1);
    const n = h.length === 3 ? h.split('').map(c => parseInt(c + c, 16)) : [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
    return [n[0], n[1], n[2], 1];
  }
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (m) { const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  if (v === 'transparent') return [0, 0, 0, 0];
  throw new Error('cannot parse ' + v);
}
const over = (top, under) => top[3] >= 1 ? top : [0, 1, 2].map(i => top[i] * top[3] + under[i] * (1 - top[3])).concat(1);
const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

let failed = 0;
function check(theme, tokens, fg, bg, need, what, underBg) {
  const base = parse(tokens[underBg || '--surface'] || underBg, tokens);
  const b = over(parse(tokens[bg] || bg, tokens), base);
  const f = over(parse(tokens[fg] || fg, tokens), b);
  const r = ratio(f, b);
  const ok = r >= need;
  if (!ok) failed++;
  if (!ok || ALL) console.log((ok ? 'ok  ' : 'FAIL') + ' ' + theme.padEnd(5) + ' ' + r.toFixed(2).padStart(5) + ' (needs ' + need + ')  ' + fg + ' on ' + bg + (underBg ? ' over ' + underBg : '') + '  — ' + what);
}

for (const [theme, t] of [['light', light], ['dark', dark]]) {
  for (const bg of ['--bg', '--surface', '--surface-sunk', '--surface-hover']) {
    check(theme, t, '--text', bg, 4.5, 'body text');
    check(theme, t, '--text-2', bg, 4.5, 'secondary text');
    check(theme, t, '--text-3', bg, 4.5, 'tertiary text, eyebrows');
    check(theme, t, '--accent-text', bg, 4.5, 'accent text, links');
    check(theme, t, '--good', bg, 4.5, 'good text');
    check(theme, t, '--bad', bg, 4.5, 'bad text');
    check(theme, t, '--focus-color', bg, 3, 'focus ring');
    check(theme, t, '--control-border', bg, 3, 'the edge of a field, radio or switch', bg);
  }
  check(theme, t, '--accent-text', '--accent-wash', 4.5, 'accent text on its wash');
  check(theme, t, '--good', '--good-wash', 4.5, 'good text on its wash');
  check(theme, t, '--bad', '--bad-wash', 4.5, 'bad text on its wash');
  check(theme, t, '--on-primary', '--primary', 4.5, 'primary button');
  check(theme, t, '--on-primary', '--primary-hover', 4.5, 'primary button, hover');
  check(theme, t, '--on-inverse', '--inverse', 4.5, 'inverse surfaces');
  check(theme, t, '--on-inverse-2', '--inverse', 4.5, 'inverse surfaces, secondary');
  check(theme, t, '--on-good-solid', '--good-solid', 4.5, 'toast icon, correct choice');
  check(theme, t, '--on-primary', '--good', 4.5, 'the correct choice button');
  check(theme, t, '--on-bad-solid', '--bad-solid', 4.5, 'toast icon, wrong');
  check(theme, t, '--text', '--seg-on', 4.5, 'segmented control, on');
  check(theme, t, '--text-2', '--surface-sunk', 4.5, 'segmented control, off');
  // The dark card on Home and the notice read the night theme's text
  const d = Object.assign({}, t, onDark);
  for (const k of ['--text', '--text-2', '--text-3', '--accent-text', '--good', '--bad']) check(theme, d, k, '--inverse', 4.5, 'on the Daily Five card / notice');
  check(theme, d, '--focus-color', '--inverse', 3, 'focus ring on the Daily Five card');
  // Mastery ramp: each step against the card it is drawn on, and against its neighbours
  for (const bg of ['--surface', '--bg']) {
    check(theme, t, '--m1', bg, 1.5, 'mastery: learning against the card');
    check(theme, t, '--m2', bg, 3, 'mastery: familiar against the card');
    check(theme, t, '--m3', bg, 3, 'mastery: mastered against the card');
  }
  check(theme, t, '--m1', '--m0', 1.3, 'mastery: learning against new');
  check(theme, t, '--m2', '--m1', 1.3, 'mastery: familiar against learning');
  check(theme, t, '--m3', '--m2', 1.3, 'mastery: mastered against familiar');
  // The map: labels, and marks against the land they sit in and against each other
  check(theme, t, '--g-label', '--g-halo', 4.5, 'map labels on their halo', '--g-land');
  check(theme, t, '--g-label', '--g-land', 4.5, 'map labels on land');
  check(theme, t, '--g-border', '--g-land', 1.5, 'borders on land', '--g-land');
  check(theme, t, '--g-land', '--g-dim', 1.3, 'the round\'s land against the land around it', '--g-land');
  check(theme, t, '--g-land', '--g-ocean-2', 1.5, 'land against sea', '--g-land');
  check(theme, t, '--g-found', '--g-land', 1.3, 'found mark on land', '--g-land');
  check(theme, t, '--g-missed', '--g-land', 1.3, 'missed mark on land', '--g-land');
  check(theme, t, '--g-second', '--g-land', 1.15, 'second-try mark on land', '--g-land');
  check(theme, t, '--g-found', '--g-missed', 1.25, 'found against missed (told apart without hue)', '--g-land');
  check(theme, t, '--g-found', '--g-second', 1.2, 'found against second try (told apart without hue)', '--g-land');
  check(theme, t, '--g-second', '--g-missed', 1.25, 'second try against missed (told apart without hue)', '--g-land');
  check(theme, t, '--g-select', '--g-land', 1.5, 'the outline of the place asked about', '--g-land');
  check(theme, t, '--g-wrong', '--g-land', 2, 'wrong flash, pin', '--g-land');
  // Over imagery the credit and labels sit on the halo
  const s = Object.assign({}, t, sat);
  check(theme, s, '--g-label', '--g-halo', 4.5, 'imagery: labels and credit on their halo', '#3a5a3a');
}
console.log(failed ? failed + ' pair(s) below their threshold' : 'every pair meets its threshold');
process.exit(failed ? 1 : 0);
