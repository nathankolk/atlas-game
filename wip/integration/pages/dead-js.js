// Lists functions and top-level constants of the app script that are named only where they are defined.
'use strict';
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || '/home/user/atlas-game/public/index.html', 'utf8');
const names = new Set();
src.replace(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm, (m, n) => { names.add(n); return m; });
src.replace(/^  (?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm, (m, n) => { names.add(n); return m; });
const out = [];
names.forEach(n => {
  const count = (src.match(new RegExp('(^|[^\\w$.])' + n.replace(/\$/g, '\\$') + '(?![\\w$])', 'g')) || []).length +
    (src.match(new RegExp('\\.' + n.replace(/\$/g, '\\$') + '(?![\\w$])', 'g')) || []).length;
  if (count <= 1) out.push(n);
});
console.log(out.join(' '));
