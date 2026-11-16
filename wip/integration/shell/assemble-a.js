// Step A: new head, design system CSS, app shell markup; legacy CSS re-pointed at the tokens.
// Usage: node assemble-a.js <index.html in> <index.html out>
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');
const path = require('path');
const here = __dirname;
const read = f => fs.readFileSync(path.join(here, f), 'utf8').replace(/\n$/, '');
const src = fs.readFileSync(process.argv[2], 'utf8').split('\n');
const L = (a, b) => src.slice(a - 1, b).join('\n');
function retoken(text) {
  fs.writeFileSync(path.join(here, '.tmp-in.css'), text);
  execFileSync('node', [path.join(here, 'retoken.js'), path.join(here, '.tmp-in.css'), path.join(here, '.tmp-out.css')]);
  return fs.readFileSync(path.join(here, '.tmp-out.css'), 'utf8');
}
// Exact-string replacement that fails loudly when the text is not there
function swap(text, from, to, all) {
  if (!text.includes(from)) throw new Error('not found: ' + from);
  return all ? text.split(from).join(to) : text.replace(from, to);
}

if (src[37] !== '<style>' || !/MENU SCREEN/.test(src[126]) || !/GAME SCREEN/.test(src[578])) throw new Error('unexpected input layout');

// --- old menu CSS (temporary, goes with the old menu): drop .brand*, loading and error states
let menuCss = L(127, 140) + '\n' + L(166, 544);

// --- game / results / learn / pin
let game = retoken(L(579, 1845));
game = swap(game, 'background: linear-gradient(to bottom, rgba(241,231,210,0.9), rgba(241,231,210,0.5));', 'background: var(--bg);');
game = swap(game, 'background: linear-gradient(to bottom, rgba(241,231,210,0.5), transparent);', 'background: linear-gradient(to bottom, var(--bg), transparent);');
game = swap(game, 'background: rgba(31,42,58,0.92);', 'background: var(--inverse);');
game = swap(game, '    color: var(--bg);\n    font-family: var(--font-display);\n    font-size: 22px;', '    color: var(--on-inverse);\n    font-family: var(--font-display);\n    font-size: 22px;');
game = swap(game, 'background: rgba(241,231,210,0.75);', 'background: var(--bg-glass);');
game = swap(game, 'background: linear-gradient(to top, rgba(241,231,210,0.9), transparent);', 'background: linear-gradient(to top, var(--bg), transparent);');
game = swap(game, '    background: var(--accent);\n    color: var(--text);\n    border-color: var(--accent-text);\n    font-weight: 600;', '    background: var(--accent);\n    color: var(--ink);\n    border-color: var(--accent-text);\n    font-weight: 600;');
game = swap(game, '    border-color: var(--accent-text);\n    color: var(--text);\n  }\n\n  .ctrl-btn.share.copied', '    border-color: var(--accent-text);\n    color: var(--ink);\n  }\n\n  .ctrl-btn.share.copied');
game = swap(game, 'color: #fff;', 'color: var(--on-primary);', true);
game = swap(game, '    background: var(--text);\n    color: var(--bg);\n    padding: 12px 22px;', '    background: var(--inverse);\n    color: var(--on-inverse);\n    padding: 12px 22px;');
game = swap(game, '.toast.wrong em { color: #d47d6a; }', '.toast.wrong em { color: var(--bad); }');
game = swap(game, 'background: linear-gradient(135deg, rgba(31,42,58,0.96) 0%, rgba(58,74,96,0.96) 100%);', 'background: var(--inverse);');
game = swap(game, 'fill: #f0dfb0;', 'fill: var(--g-near);');
game = swap(game, '    fill: #ede3cc;\n    opacity: 0.55;', '    fill: var(--g-land);\n    opacity: 0.5;');
game = swap(game, '.country.eligible:hover { fill: var(--land); }', '.country.eligible:hover { fill: var(--g-land); }', true);
game = swap(game, '.country.ineligible { fill: #ede3cc; }', '.country.ineligible { fill: var(--g-land); }');
game = swap(game, 'var(--map-ocean)', 'var(--g-ocean-2)', true);
game = swap(game, 'stroke: var(--ocean-deep);', 'stroke: var(--g-ocean-3);');
game = swap(game, '    fill: #ead39a !important;\n    stroke: var(--accent-text);', '    fill: var(--g-near) !important;\n    stroke: var(--accent-text);');
// land-border was also the hairline of panels and buttons: those take the rule token
game = game.split('\n').map(line => /^\s*border[a-z-]*:.*var\(--g-border\)/.test(line) ? line.replace('var(--g-border)', 'var(--rule-strong)') : line).join('\n');
// Cormorant defaults to old-style figures; scores read better lined up
game += '\n  .stat-value, .grade-big, .r-stat-value, .best-value { font-variant-numeric: lining-nums; }\n';
// results: no vertical centring on a scrolling container (it clipped the top); centre with auto margins
game = swap(game, '  #results-screen {\n    align-items: center;\n    justify-content: center;\n    padding: 40px 20px;\n    overflow-y: auto;\n  }',
  '  #results-screen {\n    padding: 40px 20px;\n    overflow-y: auto;\n  }');
game = swap(game, '  .results-inner {\n    max-width: 760px;\n    width: 100%;\n    text-align: center;\n  }',
  '  .results-inner {\n    max-width: 760px;\n    width: 100%;\n    margin: auto;\n    text-align: center;\n  }\n\n' +
  '  .results-kicker {\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    gap: 18px;\n    margin-bottom: 14px;\n  }\n' +
  '  .results-kicker-line {\n    flex: 0 0 80px;\n    height: 1px;\n    background: linear-gradient(to right, transparent, var(--text) 50%, transparent);\n  }\n' +
  '  .results-kicker-mark {\n    font-family: var(--font-display);\n    font-size: 13px;\n    font-weight: 500;\n    letter-spacing: 0.35em;\n    text-transform: uppercase;\n    color: var(--accent-text);\n    font-style: italic;\n  }');

// --- sub-menu / daily / folder cards (temporary), overlay, notice, sync entry, sync modal
let rest = retoken(L(1846, 2194) + '\n' + L(2235, 2456));
rest = swap(rest, 'background: rgba(241,231,210,0.92);', 'background: var(--bg-glass);');
rest = swap(rest, '    background: var(--text);\n    color: var(--bg);\n    padding: 12px 20px;', '    background: var(--inverse);\n    color: var(--on-inverse);\n    padding: 12px 20px;');
rest = rest.split('\n').map(line => /^\s*border[a-z-]*:.*var\(--g-border\)/.test(line) ? line.replace('var(--g-border)', 'var(--rule-strong)') : line).join('\n');

let media = retoken(L(2457, 2507));

const style = ['<style>', read('css-1-system.css'), read('css-2-home.css'), read('css-3-sheet.css'), '',
  menuCss, game, rest, media, read('css-9-responsive.css'), '</style>', '</head>'].join('\n');

// --- body
let gameMarkup = L(2543, 2664);
gameMarkup = swap(gameMarkup, '      <div class="brand">\n        <div class="brand-line"></div>\n        <div class="brand-mark">Expedition Complete</div>\n        <div class="brand-line"></div>\n      </div>',
  '      <div class="results-kicker">\n        <div class="results-kicker-line"></div>\n        <div class="results-kicker-mark">Expedition Complete</div>\n        <div class="results-kicker-line"></div>\n      </div>');
const modals = L(2666, 2704);
const tail = L(2708, src.length);
const body = [read('body-shell-top.html'), read('body-views.html'), '', gameMarkup, '', modals, '', '</div>', '',
  '<nav class="tabbar" id="tabbar" aria-label="Primary"></nav>', '', tail].join('\n');

fs.writeFileSync(process.argv[3], [L(1, 32), read('head-new.html'), style, body].join('\n'));
