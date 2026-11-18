#!/bin/bash
# Runs every check of the logic stage; prints each suite's summary line (full output in _out/)
cd "$(dirname "$0")"
mkdir -p _out
export NODE_PATH=/opt/node-tools/node_modules
# The exit status is the number of suites that failed, and the last line says so
bad=0
./check-syntax.sh > _out/syntax.txt 2>&1 && echo "syntax ok" || { echo "SYNTAX FAILED"; bad=$((bad+1)); }
# The modules are tested out of the page itself now (the repo's tools/tests); the paste checks are retired
node /home/user/atlas-game/tools/tests/run.js --quick || bad=$((bad+1))
for t in t1-registry-world t2-modes t3-links-b4-d6 t4-sync-reset t5-payload-size t6-duplicate-names t8-sync-devices; do
  node $t.js > _out/$t.txt 2>&1
  code=$?
  [ $code -ne 0 ] && bad=$((bad+1))
  echo "$t: exit $code — $(tail -1 _out/$t.txt)"
  grep -A3 '^FAIL' _out/$t.txt | cut -c1-600
done
echo "logic suites failed: $bad"
exit $bad
