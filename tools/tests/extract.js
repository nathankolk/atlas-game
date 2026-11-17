// Pulls the self-contained modules out of public/index.html, so that their
// tests run against the code the site serves. The page is the one source of
// truth: edit a module there, then run its tests from this folder.
//
//   const { source, file } = require('./extract.js');
//   source('mastery')   the module's text
//   file('mastery')     a path to that text in a temp file, for require()
//
// Modules: 'globe' (the globe engine), 'mastery' (learning history),
// 'quiz' (typed answers, capital choices, flags), 'world-facts' (capitals,
// ISO codes, typed spellings: two spaces in on the page, flush left here).
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PAGE = path.resolve(__dirname, '../../public/index.html');

// Where each module starts and ends on the page. `through` keeps the end
// marker in the text; `indent` is stripped from the front of every line.
const MODULES = {
  'globe': {
    start: '/* =========================================================\n * GLOBE ENGINE\n',
    end: '/* ===== END OF GLOBE ENGINE ===== */'
  },
  'mastery': {
    start: '/* =========================================================\n * MASTERY (per-item learning history',
    end: '/* ===== END OF MASTERY MODULE ===== */'
  },
  'quiz': {
    start: '/* ===== QUIZ LOGIC (quiz.js)',
    end: '/* ===== END QUIZ LOGIC (quiz.js) ===== */',
    through: true
  },
  'world-facts': {
    start: '  // Capital, ISO 3166-1 alpha-2 code, and (optional) other capitals',
    end: '  /* ===== END OF WORLD FACTS ===== */',
    indent: '  '
  }
};

let page = null;

function source(name) {
  const spec = MODULES[name];
  if (!spec) throw new Error('No module called ' + name + ' (there are: ' + Object.keys(MODULES).join(', ') + ')');
  if (page === null) page = fs.readFileSync(PAGE, 'utf8');
  const a = page.indexOf(spec.start), b = page.indexOf(spec.end);
  if (a < 0 || b < a || page.indexOf(spec.start, a + 1) >= 0 || page.indexOf(spec.end, b + 1) >= 0) {
    throw new Error('The markers of ' + name + ' are not on the page exactly once, in order');
  }
  let text = page.slice(a, spec.through ? b + spec.end.length : b);
  if (spec.indent) {
    text = text.split('\n').map(line => line.startsWith(spec.indent) ? line.slice(spec.indent.length) : line).join('\n');
  }
  return text;
}

// The module's text in a file of its own (rewritten on every call)
function file(name) {
  const dir = path.join(os.tmpdir(), 'atlas-modules');
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, name + '.js');
  fs.writeFileSync(target, source(name));
  return target;
}

module.exports = { source, file, PAGE, MODULES };

// Run directly: list each module and its size, as a check that the markers hold
if (require.main === module) {
  Object.keys(MODULES).forEach(name => {
    const text = source(name);
    console.log(name.padEnd(12) + String(text.split('\n').length).padStart(6) + ' lines' + String(text.length).padStart(9) + ' chars');
  });
}
