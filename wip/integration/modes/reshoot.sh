#!/bin/bash
# Takes the in-play scenes again for the two light variants, side by side
cd /tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad/work/integration/modes
export NODE_PATH=/opt/node-tools/node_modules
timeout 900 node shoot-modes.js --only=pick,find,flag,name > reshoot-d-light.log 2>&1 &
timeout 900 node shoot-modes.js --mobile --only=pick,find,flag,name > reshoot-m-light.log 2>&1 &
wait
echo done > reshoot.done
