#!/bin/bash
# The visual sweep: every screen at five sizes, both themes, for a new player and a seeded one.
# Writes screenshots to shots/app/polish/sw-* and one audit log per run to sweep/<size>-<theme>-<seed>.log
S=/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad
cd $S/work/integration/polish
export NODE_PATH=/opt/node-tools/node_modules
mkdir -p sweep
VIEWS="home,home@700,home@1700,explore,explore:France,stats,stats@900,settings,settings@700,sheet:europe,sheet:capitals-world,sheet:india-states"
PLAY="play:Europe,play:World,play:capitals-europe,play:capitals-find-europe,play:flags-europe,play:name-europe,play:pin-europe,play:us-state,play:us-state-to-capital,play:northeast-cities,play:india-states,learn:Europe,results:Oceania,results:pin-oceania"
run() { # size theme seed
  local flags="--size=$1 --seed=$3 --audit --tag=sw-$3"
  [ "$2" = dark ] && flags="$flags --dark"
  node shot.js $flags --scenes=$VIEWS > sweep/$1-$2-$3-views.log 2>&1 &
  node shot.js $flags --scenes=$PLAY > sweep/$1-$2-$3-play.log 2>&1 &
  wait
}
for size in ${SIZES:-1280x800 1024x768 768x1024 390x844 360x640}; do
  run $size light rich
  run $size dark new
done
# The seeded player in the dark and the new one in the light, at the two sizes most people use
for size in ${EXTRA:-1280x800 390x844}; do
  run $size dark rich
  run $size light new
done
echo SWEEP DONE
