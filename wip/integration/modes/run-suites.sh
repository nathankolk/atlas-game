#!/bin/bash
# Runs every suite on the tree as it stands, one after another; a line per suite in suites.log
S=/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad
export NODE_PATH=/opt/node-tools/node_modules
OUT=$S/work/integration/modes/suites
mkdir -p $OUT
LOG=$S/work/integration/modes/suites.log
: > $LOG
run() { # name, dir, command...
  local name=$1 dir=$2; shift 2
  (cd $dir && timeout 2400 "$@" > $OUT/$name.log 2>&1)
  echo "$name: exit $? — $(grep -v '^\s*$' $OUT/$name.log | tail -1 | cut -c1-200)" >> $LOG
}
run modes-desktop $S/work/integration/modes node check-modes.js
run modes-mobile $S/work/integration/modes node check-modes.js --mobile
run smoke-desktop $S/harness node smoke.js
run smoke-mobile $S/harness node smoke.js --mobile
run shell-desktop $S/work/integration/shell node check-shell.js
run shell-mobile $S/work/integration/shell node check-shell.js --mobile
run stats-desktop $S/work/integration/pages node check-stats.js
run stats-mobile $S/work/integration/pages node check-stats.js --mobile
run settings-desktop $S/work/integration/pages node check-settings.js
run settings-mobile $S/work/integration/pages node check-settings.js --mobile
run game-desktop $S/work/integration/game node check-game.js
run game-mobile $S/work/integration/game node check-game.js --mobile
run globe-desktop $S/work/integration/globe-stage node check-globe.js
run globe-mobile $S/work/integration/globe-stage node check-globe.js --mobile
run edges $S/work/integration/globe-stage node check-edges.js
run logic $S/work/integration/logic-tests ./run-all.sh
run b4-learn $S/work/integration/logic-tests node v-b4-learn.js
echo ALL DONE >> $LOG
