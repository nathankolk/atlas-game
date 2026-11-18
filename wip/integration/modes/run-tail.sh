#!/bin/bash
S=/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad
export NODE_PATH=/opt/node-tools/node_modules
OUT=$S/work/integration/modes/suites
LOG=$S/work/integration/modes/tail.log
: > $LOG
run() { local name=$1 dir=$2; shift 2
  (cd $dir && timeout 2400 "$@" > $OUT/$name.log 2>&1)
  echo "$name: exit $? — $(grep -v '^\s*$' $OUT/$name.log | tail -1 | cut -c1-200)" >> $LOG
}
run modes-name-keys $S/work/integration/modes node check-modes.js --only=name,keys
run shell-desktop $S/work/integration/shell node check-shell.js
run shell-mobile $S/work/integration/shell node check-shell.js --mobile
echo SUITES DONE >> $LOG
cd $S/work/integration/modes
(timeout 1500 node shoot-modes.js > shoot-d-light.log 2>&1; timeout 1500 node shoot-modes.js --dark > shoot-d-dark.log 2>&1) &
(timeout 1500 node shoot-modes.js --mobile > shoot-m-light.log 2>&1; timeout 1500 node shoot-modes.js --mobile --dark > shoot-m-dark.log 2>&1) &
wait
echo ALL DONE >> $LOG
