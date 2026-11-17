#!/bin/sh
# The stage's screenshot set: every scene at desktop and phone, light and dark.
# Usage: NODE_PATH=/opt/node-tools/node_modules sh shoot-all.sh   (writes shots/app/game/<scene>-<d|m>-<light|dark>.png)
cd "$(dirname "$0")"
S=$(cd ../../.. && pwd)
SEED=$S/harness/scratch/seed-rich.json
UNPLAYED=$S/harness/scratch/seed-rich-unplayed.json
shot() { # name, level, rest of the flags
  name=$1; level=$2; shift 2
  node shoot.js "$name-d-light" "$level" "$@" 2>&1 | grep -v '^saved' &
  node shoot.js "$name-d-dark" "$level" --dark "$@" 2>&1 | grep -v '^saved' &
  node shoot.js "$name-m-light" "$level" --mobile "$@" 2>&1 | grep -v '^saved' &
  node shoot.js "$name-m-dark" "$level" --mobile --dark "$@" 2>&1 | grep -v '^saved' &
  wait
  echo "$name"
}
shot 01-continent africa --plan=f,f,f,s,f,m,f,f,s,f,k,f,f,w --elapsed=187
shot 02-capitals us-state-to-capital --plan=f,s,f,m,w --elapsed=75
shot 03-cities northeast-cities --plan=f,f,s,f,m,f,w --elapsed=64
shot 04-pin-aim pin-europe --plan=f,s,m,p --elapsed=95
shot 05-pin-drop pin-europe --plan=f,s,m,d --elapsed=95
shot 06-learn-study china-provinces --learn --plan=q,f,q,f,f,q,f,f,f
shot 07-learn-quiz china-provinces --learn --plan=q,f,q,f,f,q,f,f,f,q,f
shot 08-review south-america --rest=mix --viewmap --seed=$SEED
shot 09-hard africa --diff=hard --plan=f,f,s,m,f,w --elapsed=40
shot 10-uncharted south-america --diff=uncharted --plan=f,f,s,m,f,w --elapsed=40
shot 11-results-record oceania --rest=f --seed=$SEED --elapsed=20
shot 12-results-full south-america --rest=mix --seed=$SEED --elapsed=120
shot 13-results-daily daily --rest=mix --seed=$UNPLAYED --elapsed=30
shot 14-results-practice africa --practice=8 --rest=mix --seed=$SEED --elapsed=45
shot 15-results-pin pin-oceania --rest=mix --seed=$SEED --elapsed=200
shot 16-results-learn canada-provinces --learn --rest=learn --elapsed=300
