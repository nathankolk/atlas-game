# Mastery module — specification

Per-item learning history + spaced repetition + daily activity, as one self-contained script
`$S/work/mastery/mastery.js` defining a global `Mastery` (IIFE; will be pasted into the game's script).
Pure logic: no DOM. Storage and clock are injectable so it runs under node for tests.

```js
const mastery = Mastery.create({ storage: localStorage, now: () => Date.now() });
```

## Store — `localStorage["atlas-mastery"]`, compact because it rides in the 64 KB sync payload
```js
{ v: 1,
  items: { "<skill>": { "<name>": [seen, first, second, missed, streak, box, dueDay, lastDay] } },
  days:  { "<dayNumber>": [games, questions, firstTry, seconds] } }
```
- `skill` is an opaque string chosen by the game (e.g. `world-country`, `us-state`, `province:china`,
  `capital`, `flag`, `name`). `name` is the game's canonical name.
- `dayNumber` = whole local-calendar days since 2026-01-01 (local midnight), an integer.
- Corrupt or missing data loads as an empty store; never throw on load/save (storage may be full/blocked).
- Writes are debounced by the caller? No — `record()` saves immediately but cheaply (one JSON.stringify);
  expose `flush()` as a no-op alias so callers can be uniform.

## Scheduling (Leitner)
`INTERVALS = [0, 1, 3, 7, 16, 35]` days by box 0–5.
- outcome `'first'` (right on the first try): `box = min(5, box + 1)`, `streak++`, `due = today + INTERVALS[box]`.
- outcome `'second'` (right on the second try): `box = max(1, min(box, 2))`, `streak = 0`, `due = today + 1`.
- outcome `'miss'` (missed twice or skipped): `box = 1`, `streak = 0`, `due = today` (due again straight away).
Levels: `new` (never seen), `learning` (box ≤ 1), `familiar` (box 2–3), `mastered` (box ≥ 4).
Mastery weight by box: `[0, 0.2, 0.45, 0.7, 0.9, 1]`.

## API
- `record(skill, name, outcome)` → the updated item (normalized object, see `get`).
- `recordSession({ questions, firstTry, seconds })` → adds to today's row (games + 1).
- `get(skill, name)` → `{ seen, first, second, missed, streak, box, due, last, accuracy /* first/seen or null */, level, isDue }`.
- `summary(skill, names)` → `{ total, seen, new, learning, familiar, mastered, due, accuracy, pct /* 0–100, mean weight */ }`.
- `due(skill, names, { limit })` → names due today or earlier (seen ≥ 1), most overdue first, then lowest box, then most missed.
- `weakest(skill, names, n, { minSeen = 2 })` → lowest first-try accuracy first; ties → more misses → more recent.
- `levels(skill, names)` → `{ name: level }` for colouring a map.
- `activity(daysBack)` → array oldest→newest of `{ day, date /* 'YYYY-MM-DD' local */, games, questions, firstTry, seconds }` including zero days.
- `streak()` → `{ current, longest }` (a day counts with ≥ 1 game; `current` survives until the end of the day after the last active day).
- `totals()` → `{ games, questions, firstTry, seconds, daysActive, itemsSeen, itemsMastered }`.
- `skills()` → list of skills present.
- `exportBlob()` / `mergeBlob(remote)` for sync: items — keep the entry with the larger `seen`, tie → later `lastDay`,
  tie → higher box; days — element-wise max. `mergeBlob` must tolerate missing/garbage input. Returns true if anything changed.
- `prune()` — drop day rows older than 400 days (called on save).
- `byteSize()` → length of the serialized store.
- `reset()`.
- Constants exposed: `Mastery.INTERVALS`, `Mastery.LEVELS`.

## Deliverables
- `mastery.js`
- `test-mastery.js` — node script (no framework; assert + a fake storage + a fake clock) covering every API,
  the scheduling table, day boundaries (local midnight, DST change days), streak edge cases, merge
  commutativity/idempotence, corrupt storage, a store with 1,100 items staying well under 40 KB serialized,
  and storage that throws on setItem. Prints PASS/FAIL per check and exits non-zero on failure.
