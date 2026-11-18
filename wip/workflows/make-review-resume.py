# Builds atlas-final-review-resume.js: the review script with every finished agent's result pinned as a literal
# and optional notes for the agent that was cut off.
# Usage: make-review-resume.py [key note-file]...   key is review:play, review:globe, fix1
import json, sys, itertools, os
B = '/root/.claude/projects/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/'
RUNS = ['wf_2728c196-dcd']   # runs of the review pipeline, oldest first; add each new run here
label_of, pinned = {}, {'reviews': {}}
lines = itertools.chain.from_iterable(open(B + 'subagents/workflows/' + r + '/journal.jsonl') for r in RUNS
                                      if os.path.exists(B + 'subagents/workflows/' + r + '/journal.jsonl'))
for line in lines:
    try: o = json.loads(line)
    except Exception: continue
    if o.get('type') == 'started': label_of[o['agentId']] = o['label']
    if o.get('type') == 'result' and o.get('result'):
        lab = label_of[o['agentId']]
        if lab.startswith('review:'): pinned['reviews'][lab[7:]] = o['result']
        elif lab == 'fix-findings': pinned['fix1'] = o['result']
notes = {}
a = sys.argv[1:]
for i in range(0, len(a), 2): notes[a[i]] = open(a[i + 1]).read()
W = B + 'workflows/scripts/'
s = open(W + 'atlas-final-review.js').read()
x = "const PIN = (args && args.pinned) || {}"
y = "const RESUME = (args && args.resumeNotes) || {}"
assert s.count(x) == 1 and s.count(y) == 1
s = s.replace(x, "const PIN = " + json.dumps(pinned, ensure_ascii=True)).replace(y, "const RESUME = " + json.dumps(notes, ensure_ascii=True))
open(W + 'atlas-final-review-resume.js', 'w').write(s)
print('pinned reviews:', sorted(pinned['reviews']), 'fix1:', 'fix1' in pinned, 'notes:', sorted(notes), 'bytes:', len(s))
