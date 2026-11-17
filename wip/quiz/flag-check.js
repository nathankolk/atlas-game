// Flag check: loads the flag font in headless Chromium through the Atlas harness, runs Quiz.flagSupport,
// renders every flag in WORLD_FACTS and writes
//   flags-missing.json          countries with no flag to show (array of names, table order)
//   flags-report.json           per-country measurements
//   $S/shots/quiz/flags.png     contact sheet of every flag (plus flags-top.png / flags-bottom.png at 2x)
// Run: NODE_PATH=/opt/node-tools/node_modules node flag-check.js
'use strict';
const fs = require('fs');
const path = require('path');
const SCRATCH = path.resolve(__dirname, '..', '..');
const { launch } = require(path.join(SCRATCH, 'harness', 'atlas-harness.js'));
const data = require('./load-data.js');
const SHOTS = path.join(SCRATCH, 'shots', 'quiz');

// Runs in the page: draws each code three ways and reports what came out.
function measureAll(facts) {
  const size = 32;
  function draw(text, font) {
    const canvas = document.createElement('canvas');
    canvas.width = size * 4; canvas.height = size * 2;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.font = size + 'px ' + font;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(text, 4, size);
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let coloured = 0, painted = 0, inked = 0, hash = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue;
      inked++;
      const hi = Math.max(px[i], px[i + 1], px[i + 2]), lo = Math.min(px[i], px[i + 1], px[i + 2]);
      if (hi - lo > 48) coloured++;
      if (hi >= 96) painted++;
      hash = (Math.imul(hash, 31) + px[i] * 65536 + px[i + 1] * 256 + px[i + 2] + i) | 0;
    }
    return { width: Math.round(ctx.measureText(text).width * 10) / 10, coloured: coloured, painted: painted, inked: inked, hash: hash };
  }
  const ri = ch => String.fromCodePoint(0x1F1E6 + ch.charCodeAt(0) - 65);
  const out = {};
  Object.keys(facts).forEach(country => {
    const code = facts[country][1];
    const pair = ri(code[0]) + ri(code[1]);
    const withFont = draw(pair, Quiz.FLAG_FONT_STACK);
    const system = draw(pair, "'Noto Color Emoji', sans-serif");
    const apart = draw(ri(code[0]), Quiz.FLAG_FONT_STACK).width + draw(ri(code[1]), Quiz.FLAG_FONT_STACK).width;
    out[country] = {
      code: code, emoji: Quiz.flagEmoji(code), hasFlag: Quiz.hasFlag(facts, country), draws: Quiz.flagDraws(document, code),
      width: withFont.width, apart: Math.round(apart * 10) / 10, coloured: withFont.coloured, painted: withFont.painted, inked: withFont.inked,
      sameAsSystem: withFont.hash === system.hash && withFont.inked === system.inked, systemColoured: system.coloured
    };
  });
  return out;
}

// Runs in the page: lays the contact sheet out.
function buildSheet(args) {
  const facts = args.facts, report = args.report, support = args.support;
  document.getElementById('title').textContent = 'Flags as the game will draw them — flagSupport: ' + support;
  const names = Object.keys(facts);
  const bad = names.filter(n => report[n].missing);
  document.getElementById('summary').textContent = names.length + ' countries, ' + (names.length - bad.length) + ' with a flag from the font; red frame = no flag (' + bad.join(', ') + '); dashed frame = the font draws a flag the country has replaced, left out of flag levels (' + names.filter(n => report[n].stale).join(', ') + ')';
  const sheet = document.getElementById('sheet');
  names.forEach(name => {
    const r = report[name];
    const cell = document.createElement('div');
    cell.className = 'cell' + (r.missing ? ' missing' : r.stale ? ' stale' : '');
    const flag = document.createElement('div');
    flag.className = 'flag';
    flag.style.fontFamily = Quiz.FLAG_FONT_STACK;
    // Placeholder codes have no emoji; show the raw indicator pair so the sheet proves they draw no flag.
    flag.textContent = r.emoji || String.fromCodePoint(0x1F1E6 + r.code.charCodeAt(0) - 65, 0x1F1E6 + r.code.charCodeAt(1) - 65);
    const label = document.createElement('div');
    label.className = 'name';
    label.textContent = name;
    const code = document.createElement('div');
    code.className = 'code';
    code.textContent = r.code + (r.missing ? ' — ' + r.reason : r.stale ? ' — glyph is a superseded flag; left out' : '');
    cell.appendChild(flag); cell.appendChild(label); cell.appendChild(code);
    sheet.appendChild(cell);
  });
}

async function supportIn(mode) {
  const h = await launch({ root: __dirname, width: 800, height: 600 });
  try {
    await h.page.goto(h.url + 'flag-page.html?font=' + mode);
    const t0 = Date.now();
    const support = await h.page.evaluate(() => Quiz.flagSupport(document));
    const again = await h.page.evaluate(() => Quiz.flagSupport(document));
    return { support: support, again: again, ms: Date.now() - t0, errors: h.errors.filter(e => !/no-such-font|404/.test(e)) };
  } finally { await h.close(); }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const problems = [];
  const h = await launch({ root: __dirname, width: 1500, height: 900 });
  let report, support;
  try {
    await h.page.goto(h.url + 'flag-page.html');
    support = await h.page.evaluate(() => Quiz.flagSupport(document));
    const faces = await h.page.evaluate(() => Array.from(document.fonts).map(f => f.family + ':' + f.status));
    console.log('flagSupport with the web font declared: ' + support + '   (font faces: ' + faces.join(', ') + ')');
    if (support !== 'font') problems.push('flagSupport returned ' + support + ' with the font available');
    report = await h.page.evaluate(measureAll, data.WORLD_FACTS);
    const stale = await h.page.evaluate(() => Quiz.FLAG_STALE.slice());
    for (const name of Object.keys(report)) {
      const r = report[name];
      const reasons = [];
      if (r.emoji === '') reasons.push('placeholder code');
      if (!(r.width < r.apart * 0.75)) reasons.push('two glyphs wide');
      if (r.painted < 64) reasons.push('not a painted picture');
      if (r.sameAsSystem) reasons.push('drawn by the system font, not the flag font');
      r.missing = reasons.length > 0;
      r.reason = reasons.join('; ');
      r.stale = stale.includes(r.code);
      // The module's own test and the module's table must agree with what was measured.
      if (r.draws !== (r.width < r.apart * 0.75 && r.painted >= 64)) problems.push(name + ': Quiz.flagDraws says ' + r.draws + ' but measured ' + JSON.stringify(r));
      if (r.hasFlag !== (!r.missing && !r.stale)) problems.push(name + ': Quiz.hasFlag is ' + r.hasFlag + ' but the flag ' + (r.missing ? 'does not draw (' + r.reason + ')' : r.stale ? 'is listed as out of date' : 'draws'));
    }
    await h.page.evaluate(buildSheet, { facts: data.WORLD_FACTS, report: report, support: support });
    await h.page.evaluate(() => document.fonts.ready);
    await h.page.screenshot({ path: path.join(SHOTS, 'flags.png'), fullPage: true });
    if (h.errors.length) problems.push('page errors: ' + h.errors.join(' | '));
  } finally { await h.close(); }

  // The same sheet at 2x in two halves, for looking closely.
  const z = await launch({ root: __dirname, width: 1500, height: 900, dpr: 2 });
  try {
    await z.page.goto(z.url + 'flag-page.html');
    await z.page.evaluate(() => Quiz.flagSupport(document));
    await z.page.evaluate(buildSheet, { facts: data.WORLD_FACTS, report: report, support: support });
    await z.page.evaluate(() => document.fonts.ready);
    const box = await z.page.evaluate(() => { const r = document.documentElement.getBoundingClientRect(); return { w: Math.ceil(r.width), h: Math.ceil(document.documentElement.scrollHeight) }; });
    const half = Math.ceil(box.h / 2);
    await z.page.screenshot({ path: path.join(SHOTS, 'flags-top.png'), fullPage: true, clip: { x: 0, y: 0, width: box.w, height: half } });
    await z.page.screenshot({ path: path.join(SHOTS, 'flags-bottom.png'), fullPage: true, clip: { x: 0, y: half, width: box.w, height: box.h - half } });
  } finally { await z.close(); }

  // flagSupport when the font cannot be had. This machine has Noto Color Emoji, so the answer is 'native'.
  const broken = await supportIn('broken');
  const none = await supportIn('none');
  console.log('flagSupport with a font URL that 404s: ' + broken.support + ' (' + broken.ms + ' ms)');
  console.log('flagSupport with no @font-face at all: ' + none.support + ' (' + none.ms + ' ms)');
  for (const [label, r] of [['broken font', broken], ['no font', none]]) {
    if (r.support !== 'native') problems.push(label + ': expected native on this machine, got ' + r.support);
    if (r.again !== r.support) problems.push(label + ': second call gave ' + r.again);
    if (r.errors.length) problems.push(label + ' page errors: ' + r.errors.join(' | '));
  }

  const names = Object.keys(report);
  const missing = names.filter(n => report[n].missing);
  fs.writeFileSync(path.join(__dirname, 'flags-missing.json'), JSON.stringify(missing, null, 2) + '\n');
  fs.writeFileSync(path.join(__dirname, 'flags-report.json'), JSON.stringify({ support: support, supportBrokenFont: broken.support, supportNoFont: none.support, checked: names.length, missing: missing, stale: names.filter(n => report[n].stale), countries: report }, null, 1) + '\n');
  const widths = names.filter(n => !report[n].missing).map(n => report[n].width);
  const col = names.filter(n => !report[n].missing).map(n => report[n].painted);
  console.log(names.length + ' countries checked; ' + (names.length - missing.length) + ' draw from the flag font; no flag for: ' + (missing.map(n => n + ' (' + report[n].code + ': ' + report[n].reason + ')').join(', ') || 'none'));
  console.log('flag width at 32px: ' + Math.min(...widths) + '-' + Math.max(...widths) + ' px against ' + Math.min(...names.map(n => report[n].apart)) + '+ px for two letters apart; painted (non-black) pixels ' + Math.min(...col) + '-' + Math.max(...col));
  console.log('glyph present but out of date (judged by eye, listed in Quiz.FLAG_STALE): ' + (names.filter(n => report[n].stale).join(', ') || 'none'));
  console.log('contact sheet: ' + path.join(SHOTS, 'flags.png'));
  if (problems.length) { console.log('FAIL\n  ' + problems.join('\n  ')); process.exit(1); }
  console.log('PASS flag check');
})().catch(e => { console.error(e); process.exit(1); });
