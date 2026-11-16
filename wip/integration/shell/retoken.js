// Re-points the legacy game / results / sync CSS at the semantic tokens.
// Usage: node retoken.js <in.css> <out.css>
'use strict';
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8').split('\n');
const out = [];
let sel = '';        // selector text of the rule being read
let depth = 0;
const SAT = /sat-on|no-borders|sat-credit|sat-canvas/;
function mapLine(line, selector) {
  let l = line;
  l = l.replace(/'Cormorant Garamond', serif/g, 'var(--font-display)')
       .replace(/'Crimson Pro', (Georgia, )?serif/g, 'var(--font-ui)')
       .replace(/'JetBrains Mono', monospace/g, 'var(--font-mono)');
  if (SAT.test(selector)) return l;
  const prop = (l.match(/^\s*([a-z-]+)\s*:/) || [])[1] || '';
  const paint = /^(fill|stroke)$/.test(prop);
  l = l.replace(/var\(--ink\)/g, 'var(--text)')
       .replace(/var\(--ink-soft\)/g, 'var(--text-2)')
       .replace(/var\(--ink-faded\)/g, 'var(--text-3)')
       .replace(/var\(--parchment\)/g, 'var(--bg)')
       .replace(/var\(--sepia\)/g, 'var(--accent-text)')
       .replace(/var\(--land\)/g, 'var(--g-land)')
       .replace(/var\(--land-border\)/g, 'var(--g-border)')
       .replace(/#dde8ed/gi, 'var(--map-ocean)')
       .replace(/rgba\((255, ?250, ?235|255, ?248, ?230|248, ?238, ?214), ?[\d.]+\)/g, 'var(--surface)')
       .replace(/rgba\(107, ?68, ?35, ?[\d.]+\)/g, 'var(--rule)');
  if (!paint) {
    l = l.replace(/var\(--gold(-bright)?\)/g, 'var(--accent)')
         .replace(/var\(--moss(-bright)?\)/g, 'var(--good)')
         .replace(/var\(--sienna(-deep)?\)/g, 'var(--bad)');
  }
  return l;
}
src.forEach(line => {
  const open = (line.match(/\{/g) || []).length, close = (line.match(/\}/g) || []).length;
  if (depth === 0 || (depth === 1 && /@media/.test(sel))) {
    if (open) sel = (sel && !/[{};]\s*$/.test(sel) && !/@media/.test(sel) ? sel + ' ' : '') + line; else if (/,\s*$/.test(line)) sel = (/,\s*$/.test(sel) ? sel + ' ' : '') + line;
  }
  out.push(mapLine(line, /@media/.test(sel) && depth >= 1 ? line + sel : sel));
  depth += open - close;
  if (depth === 0 && close) sel = '';
});
fs.writeFileSync(process.argv[3], out.join('\n'));
