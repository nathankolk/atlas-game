#!/bin/bash
# Runs the suites the stopped run had not finished or whose expectations were corrected after it; a line per suite in rest.log
S=/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad
export NODE_PATH=/opt/node-tools/node_modules
OUT=$S/work/integration/explore/suites-rest
mkdir -p $OUT
LOG=$S/work/integration/explore/rest.log
: > $LOG
run() { # name, dir, command...
  local name=$1 dir=$2; shift 2
  local t0=$(date +%s)
  (cd $dir && timeout 2400 "$@" > $OUT/$name.log 2>&1)
  echo "$name: exit $? — $(grep -v '^\s*$' $OUT/$name.log | tail -1 | cut -c1-200) [$(( $(date +%s) - t0 )) s]" >> $LOG
}
run shell-desktop $S/work/integration/shell node check-shell.js
run shell-mobile $S/work/integration/shell node check-shell.js --mobile
run game-mobile $S/work/integration/game node check-game.js --mobile
run game-desktop $S/work/integration/game node check-game.js
run edges $S/work/integration/globe-stage node check-edges.js
run smoke-mobile $S/harness node smoke.js --mobile
run explore-desktop $S/work/integration/explore node check-explore.js
run explore-mobile $S/work/integration/explore node check-explore.js --mobile
run logic $S/work/integration/logic-tests ./run-all.sh
run b4-learn $S/work/integration/logic-tests node v-b4-learn.js
echo "ALL DONE $(git -C /home/user/atlas-game rev-parse --short HEAD) $(date -u +%H:%M)" >> $LOG
