#!/bin/sh
# Extracts every inline <script> block of the given html file and runs node --check on each
f="$1"; d=$(mktemp -d)
node -e '
const fs=require("fs");const s=fs.readFileSync(process.argv[1],"utf8");
const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;let m,i=0;
while((m=re.exec(s))){fs.writeFileSync(process.argv[2]+"/s"+(i++)+".js",m[1]);}
console.log(i+" inline script blocks");' "$f" "$d"
for j in "$d"/*.js; do node --check "$j" && echo "ok $(wc -l < "$j") lines"; done
