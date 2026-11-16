#!/bin/bash
# Extracts every inline <script> block of public/index.html and runs node --check on each
set -e
OUT=$(dirname "$0")/_extracted
mkdir -p "$OUT"
node -e "
const fs=require('fs');
const html=fs.readFileSync('/home/user/atlas-game/public/index.html','utf8');
const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;let m,i=0;
while((m=re.exec(html))){fs.writeFileSync('$OUT/block'+(i++)+'.js',m[1]);}
console.log(i+' inline script block(s)');
"
for f in "$OUT"/block*.js; do node --check "$f" && echo "ok $(basename $f) ($(wc -l < $f) lines)"; done
