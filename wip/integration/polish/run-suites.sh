#!/bin/bash
# Runs every suite on the tree as it stands; a line per suite in suites.log, full output in suites/
# Two at a time (the machine has four cores); pass names to run only those.
S=/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad
export NODE_PATH=/opt/node-tools/node_modules
OUT=$S/work/integration/polish/suites
mkdir -p $OUT
LOG=$S/work/integration/polish/suites.log
[ $# -eq 0 ] && : > $LOG
ONLY=" $* "
run() { # name, dir, command...
  local name=$1 dir=$2; shift 2
  if [ "$ONLY" != "  " ] && [[ "$ONLY" != *" $name "* ]]; then return; fi
  (cd $dir && timeout 2400 "$@" > $OUT/$name.log 2>&1)
  echo "$name: exit $? — $(grep -v '^\s*$' $OUT/$name.log | tail -1 | cut -c1-200)" >> $LOG
}
lane1() {
  run polish $S/work/integration/polish node check-polish.js
  run explore-desktop $S/work/integration/explore node check-explore.js
  run shell-desktop $S/work/integration/shell node check-shell.js
  run stats-desktop $S/work/integration/pages node check-stats.js
  run settings-desktop $S/work/integration/pages node check-settings.js
  run game-desktop $S/work/integration/game node check-game.js
  run globe-desktop $S/work/integration/globe-stage node check-globe.js
  run modes-desktop $S/work/integration/modes node check-modes.js
  run smoke-desktop $S/harness node smoke.js
  run edges $S/work/integration/globe-stage node check-edges.js
}
lane2() {
  run explore-mobile $S/work/integration/explore node check-explore.js --mobile
  run shell-mobile $S/work/integration/shell node check-shell.js --mobile
  run stats-mobile $S/work/integration/pages node check-stats.js --mobile
  run settings-mobile $S/work/integration/pages node check-settings.js --mobile
  run game-mobile $S/work/integration/game node check-game.js --mobile
  run globe-mobile $S/work/integration/globe-stage node check-globe.js --mobile
  run modes-mobile $S/work/integration/modes node check-modes.js --mobile
  run smoke-mobile $S/harness node smoke.js --mobile
  run logic $S/work/integration/logic-tests ./run-all.sh
  run b4-learn $S/work/integration/logic-tests node v-b4-learn.js
  run t7 $S/work/integration/logic-tests node t7-records-function.mjs
}
lane1 & lane2 & wait
echo "ALL DONE $(date -u +%H:%M)" >> $LOG
