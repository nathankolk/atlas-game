// Lists class names and ids that the stylesheet styles but neither the markup nor the script mentions.
'use strict';
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || '/home/user/atlas-game/public/index.html', 'utf8');
const s0 = src.indexOf('<style>'), s1 = src.indexOf('</style>');
const css = src.slice(s0, s1).replace(/\/\*[\s\S]*?\*\//g, '');
const rest = src.slice(0, s0) + src.slice(s1);
const names = new Map();
// selectors only: text before each "{"
css.replace(/([^{}]+)\{/g, (m, sel) => {
  if (/^\s*(@|from|to|\d+%)/.test(sel.trim())) return m;
  (sel.match(/[.#][A-Za-z_][\w-]*/g) || []).forEach(tok => {
    if (/^#[0-9a-fA-F]{3,8}$/.test(tok)) return;
    names.set(tok, (names.get(tok) || 0) + 1);
  });
  return m;
});
const dead = [];
names.forEach((n, tok) => {
  const name = tok.slice(1);
  const re = new RegExp('(^|[^\\w-])' + name.replace(/[-]/g, '\\-') + '($|[^\\w-])');
  if (!re.test(rest)) dead.push(tok);
});
console.log(dead.sort().join('\n'));
console.error(dead.length + ' of ' + names.size + ' selectors names unused outside the stylesheet');
