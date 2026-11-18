#!/bin/bash
# My own re-check of the fixed tree: every stage suite, the module tests with the globe engine, then smoke repeats for the pin flake
S=/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad
R=$S/work/review/recheck
export NODE_PATH=/opt/node-tools/node_modules
cd /home/user/atlas-game
echo "tree $(git rev-parse --short HEAD) start $(date -u +%H:%M)" > $R/status.log
$S/work/integration/polish/run-suites.sh > $R/run-suites.out 2>&1
cp $S/work/integration/polish/suites.log $R/suites.log
echo "suites done $(date -u +%H:%M)" >> $R/status.log
(cd /home/user/atlas-game && node tools/tests/run.js --globe > $R/module-tests.log 2>&1; echo "module tests exit $? $(date -u +%H:%M)" >> $R/status.log)
for i in 1 2 3; do
  (cd $S/harness && timeout 900 node smoke.js > $R/smoke-desktop-$i.log 2>&1; echo "smoke-desktop run $i exit $? — $(grep -v '^\s*$' $R/smoke-desktop-$i.log | tail -1 | cut -c1-160)" >> $R/status.log)
done
echo "ALL DONE $(date -u +%H:%M)" >> $R/status.log
