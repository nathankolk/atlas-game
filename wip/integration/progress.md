# Integration progress

## Stage: logic layer (LEVELS registry, mastery, sync, reset, logic bugs, test hook)

Status: DONE. Commits `c2f1b63`, `4ee090c`, `381db13` (on top of `1c74e1d`). Not pushed. Working tree clean.
`$S` = the scratchpad root. Checks live in `$S/work/integration/logic-tests/` (`./run-all.sh` runs them all).

### Second pass (a fresh agent re-checked the first attempt's claims) — DONE
Commits on top of `c2f1b63`: `4ee090c` (reset-time hardening), `381db13` (`count()`). Not pushed. Tree clean.
- Re-ran everything on `c2f1b63` first: mastery tests (709 passed; review-test 180 passed across 5 zones), syntax,
  paste identity, `logic-tests/run-all.sh` (six suites), `smoke.js` 13/13 desktop and 13/13 `--mobile`. All passed.
- Read the whole stage diff against the brief. One defect found and fixed: `syncApplyRemote` took a remote `resetAt`
  of `Infinity` (JSON `1e999`) as a newer reset; `Infinity` cannot be read back from localStorage, so every pull
  wiped the device again. Non-finite now counts as "no reset". Regression check in `t4-sync-reset.js` (fails on
  `c2f1b63`, passes now; t4 is 69 checks).
- Added `level.count()` to LEVELS: item count known before a province map loads (from `PROVINCE_ROUNDS[key].count`);
  equals `names().length` on every ready level (checked in `t1`, now 37 checks).
- New probe `logic-tests/v-b4-learn.js` (real timers): stale callbacks after an abandoned Learn quiz miss and an
  abandoned city skip do nothing to the next round (10 checks).
- `logic-tests/v-names.js`: feature names are present and unique in all ten map files (repo data + CDN fallbacks).
- Fresh screenshots looked at: `$S/shots/app/logic-verify/` (`d-*`, `m-*`; the `smoke-*` folders there are
  mid-fade captures taken by the smoke suite, not a defect).
- After the two commits: run-all.sh all pass, t7 passes, smoke 13/13 desktop and 13/13 mobile.
- CLAUDE.md was deliberately NOT edited (agents may not change it without the owner); its drifts are listed below.

### Done and verified
- mastery tests: `node test-mastery.js` → 709 passed. `node review-test.js` → all 5 zones pass after fixing the
  zone-NAME check in the test (it now compares against the runtime's canonical name; ICU says Asia/Katmandu).
  `mastery.js` itself was NOT changed; the copy in index.html is byte-identical (`check-mastery-paste.js`).
- B1/D5 `featureKey` by name → World 184, Oceania 7, Australia asked in both (t1; full World round played).
- D3 capitals cards + US folder read the right record keys (t2, t4, screenshot `d-02-menu-us-bests.png`).
- D6 load-failure message shows in `#menu-content` (t3, screenshot `load-failure.png`).
- D7 deep links: fresh full round; `&learn=1`; `daily`; unknown/unbuilt slug → menu + notice, nothing written (t3).
- B4 `state.roundId` + `roundTimeout()` on all 12 listed timers and the 80 ms start delay (t3, real timers).
- LEVELS (27) + COLLECTIONS, `levelByKey`, `levelForStartArg`, `roundSkill`; `linkSlugs`/`slugForStartArg` on top;
  all 28 old slugs kept (t1).
- Mastery wiring: `scoreAnswer(points)` (replaces the seven hand-written scoring blocks), `pinOutcome`,
  `recordSession` in `finishGame` / `finishPinGame` / `learnLevelPassed`, storage event → `reload()` (t2, t4).
- `claimName` uniqueness for US cities and pin cities (no clash in today's data; t6 plants two).
- PROGRESS section: `progressSnapshot`, `exportProgress`, `eraseProgress`, `resetProgress`, `atlas-reset-at` (t4).
- Sync: payload = snapshot (+learn, +mastery, +resetAt, −hardMode), version 2; pull-side reset rule; daily trim on
  merge; learn merge + `{ done: true }` marker; readable errors; menu button error state at once (t4).
  Heavy-player payload measured at 106 KB (t5). `functions/api/records.js`: 256 KB in bytes (t7, run with plain node).
- `window.__atlas = { state, mastery, LEVELS, COLLECTIONS, startGame, levelByKey, exportProgress, resetProgress, version: 2 }`.
- `$S/harness/smoke.js`: 13/13 on desktop and with `--mobile`.
- Screenshots looked at: `$S/shots/app/logic/` (`d-*` 1280×800, `m-*` 390×844). No theme exists yet, so no dark shots.

### Not done / decided against
- `gamesPlayed` still merges with `Math.max` (D14): a correct fix needs per-device deltas plus pull-before-push
  at round end; a wrong one inflates counts for good. `mastery.totals().games` is the reliable round count.
- Difficulty and map style are still per-device (not synced), on purpose.
- CLAUDE.md / atlas_handoff.md were not updated (see drifts below).
- Real Cloudflare KV / the live site were not exercised (the Function was called directly with a stand-in KV).

### Notes for later stages
- `featureKey(f)` is now `'name:' + <raw feature name>` (e.g. `name:United States of America`), not the canonical name.
- `level.names()` is `[]` for province levels until `await level.load()`; world levels until the world map is in.
  `level.count()` is right for province levels straight away (use it for card counts and totals).
- Three city levels have `available: false` (Midwest/South/West): show them as "coming soon"; `startGame` refuses them.
- Records/focus region for a level is `resolveGameTarget(level.arg).region` (never the title).
- A finished Learn ladder leaves `{ done: true, savedAt }` under its round key in `atlas-learn`: list ladders in
  progress through `getLearnProgress()` (null for the marker), never by raw keys.
- Practice rounds and finished ladders now push to sync (they change mastery / learn). `atlas-hard-mode` is no longer written.
- Any new delayed callback during play must use `roundTimeout`, not `setTimeout`.
- `showNotice(text)` (`#app-notice`, `.app-notice`) is the only toast outside the game screen; plain text; hidden on
  leaving the menu. `resetProgress()` redraws the menu and returns the push promise.
- The mastery module sits at column 0 between its banner and `/* ===== END OF MASTERY MODULE ===== */`; keep it
  byte-identical to `$S/work/mastery/mastery.js`.
- Australia re-enters the Daily Five's easy pool: the daily sequence changes from the deploy day on.
- Test traps: the harness's `seedStorage` refills any missing key on every load (undoes a reset on reload); at small
  windows the top of the menu is out of a real click's reach (defect D1) — use DOM clicks; painting the 50m SVG map
  in software takes seconds per frame — `lib.js` has `noPaint` and `fast` options.
- Doc drifts to fix in a docs pass: CLAUDE.md says 64KB body limit, "cleared when the ladder is finished",
  practice/Learn "don't push to sync", `linkSlugs()` description, `atlas-hard-mode` being written.

## Stage: design system, app shell, Home, level sheet

Status: IN PROGRESS (started from commit 381db13; smoke 13/13 confirmed at the start).
Working files for this stage: `$S/work/integration/shell/` (CSS fragments, splice scripts, shot scripts).
Screenshots: `$S/shots/app/shell/`.

### Plan (commit after each)
1. Tokens + themes + base + components + shell (top nav, tab bar, VIEWS, hash rules, stats/settings
   placeholders), legacy game/results/sync CSS re-pointed at semantic tokens. Old menu still inside.
2. Home (masthead, Today, Library) replacing the old menu tree and its CSS.
3. Level sheet replacing the focus chooser.
4. Screenshots both themes/sizes, smoke suite, fixes.

### Done and verified
(nothing yet)
