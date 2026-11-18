// The quiz module pasted into index.html must be byte-identical to work/quiz/quiz.js, and the world
// facts section must be work/data/world-facts.js two spaces in. The flag font must be the package's file.
'use strict';
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync('/home/user/atlas-game/public/index.html', 'utf8');
let failed = false;
const fail = (msg) => { console.log('FAIL ' + msg); failed = true; };

function between(start, end, inclusiveEnd) {
  const a = html.indexOf(start), b = html.indexOf(end);
  if (a < 0 || b < 0 || html.indexOf(start, a + 1) >= 0 || html.indexOf(end, b + 1) >= 0) return null;
  return html.slice(a, inclusiveEnd ? b + end.length : b);
}

// 1. quiz.js: from its banner line to its END marker line
const quiz = fs.readFileSync(path.join(__dirname, '../../quiz/quiz.js'), 'utf8');
const pastedQuiz = between('/* ===== QUIZ LOGIC (quiz.js)', '/* ===== END QUIZ LOGIC (quiz.js) ===== */', true);
if (pastedQuiz === null) fail('quiz markers not found exactly once');
else if (pastedQuiz !== quiz.replace(/\n$/, '')) fail('pasted quiz module differs from quiz.js (' + pastedQuiz.length + ' vs ' + quiz.length + ' chars)');
else console.log('PASS pasted quiz module is byte-identical to quiz.js (' + quiz.length + ' chars)');

// 2. world-facts.js: every non-empty line two spaces in, between the section banner and its END marker
const facts = fs.readFileSync(path.join(__dirname, '../../data/world-facts.js'), 'utf8');
const section = between('  // Capital, ISO 3166-1 alpha-2 code, and (optional) other capitals', '  /* ===== END OF WORLD FACTS ===== */');
if (section === null) fail('world facts markers not found exactly once');
else {
  const want = facts.split('\n').map(line => line.trim() ? '  ' + line : line).join('\n');
  if (section !== want) fail('pasted world facts differ from world-facts.js (' + section.length + ' vs ' + want.length + ' chars)');
  else console.log('PASS pasted world facts are world-facts.js, two spaces in (' + facts.length + ' chars)');
}

// 3. the font file
const fontSrc = fs.readFileSync(path.join(__dirname, '../../quiz/pkg/x/package/dist/TwemojiCountryFlags.woff2'));
let fontRepo = null;
try { fontRepo = fs.readFileSync('/home/user/atlas-game/public/vendor/TwemojiCountryFlags.woff2'); } catch (e) { /* reported below */ }
if (!fontRepo || !fontRepo.equals(fontSrc)) fail('public/vendor/TwemojiCountryFlags.woff2 is missing or not the package file');
else console.log('PASS flag font is the package file (' + fontSrc.length + ' bytes)');

process.exit(failed ? 1 : 0);
