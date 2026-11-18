# Builds atlas-learning-resume.js: the pipeline script with every finished stage's result pinned as a literal
# and an optional note for the stage that was cut off. Usage: make-resume.py [note-stage note-file]
import json, sys
W = '/root/.claude/projects/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/workflows/scripts/'
B = '/root/.claude/projects/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/subagents/workflows/'
JOURNALS = [B + r + '/journal.jsonl' for r in ('wf_a0037ef9-053', 'wf_efece3ab-2bd', 'wf_cae25b30-a8e')]   # runs of this pipeline, oldest first
label_of, pinned = {}, {}
keyname = {'quiz-module': 'quiz', 'new-modes': 'modes', 'explore-learn': 'explore', 'polish-perf-docs': 'polish'}
import itertools
for line in itertools.chain.from_iterable(open(j) for j in JOURNALS):
    try: o = json.loads(line)
    except Exception: continue
    if o.get('type') == 'started': label_of[o['agentId']] = o['label']
    if o.get('type') == 'result' and o.get('result'): pinned[keyname[label_of[o['agentId']]]] = o['result']
notes = {}
if len(sys.argv) == 3: notes[sys.argv[1]] = open(sys.argv[2]).read()
s = open(W + 'atlas-learning.js').read()
a = "const PIN = (args && args.pinned) || {}"
b = "const RESUME = (args && args.resumeNotes) || {}"
assert s.count(a) == 1 and s.count(b) == 1
s = s.replace(a, "const PIN = " + json.dumps(pinned, ensure_ascii=True)).replace(b, "const RESUME = " + json.dumps(notes, ensure_ascii=True))
open(W + 'atlas-learning-resume.js', 'w').write(s)
print('pinned:', sorted(pinned), 'notes:', sorted(notes), 'bytes:', len(s))
