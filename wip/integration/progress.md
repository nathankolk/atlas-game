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

### Done and verified (see commits; from here on edit public/index.html directly, the fragments in shell/ are spent)
- 0adb5d5 design system + themes + shell (VIEWS, #stats/#settings, theme toggle, streak chip, sync row in Settings).
  smoke 13/13 desktop. Legacy game/results/sync CSS re-pointed at tokens by shell/retoken.js + assemble-a.js.
- (next commit) Home + level sheet + Smart Review: old menu tree, focus chooser and their CSS removed.
  smoke 13/13 desktop. Looked at: shots/app/shell/b-home-*.png, c-sheet-*.png (light/dark, desktop/phone).
- Seeds for screenshots: shell/seed-rich.json (played today), seed-rich-unplayed.json, seed-old.json (no mastery);
  regenerate with shell/gen-seed.js. Shot helpers: shell/shoot.js (views, --js to click), shell/shoot-game.js.

### Closed out by the next stage (commit e7ed088, pushed)
- Status of this stage: DONE. Commits 0adb5d5, 3f66458, e7ed088.
- smoke.js 13/13 desktop and 13/13 --mobile.
- shell/check-shell.js (interaction checks: new player, sheet keyboard + focus trap + start paths, returning
  player, old stores only, views/hash/theme, daily + review playlist with Next, back button + lazy province
  fill-in, layout tops) passes on desktop and --mobile. Two expectations in it were wrong and were corrected:
  places skipped in a review are due again the same day (mastery SPEC), and the lazy-fill check now looks at the
  Russia round the seed has history for (russia-west).
- "Home twice" at phone width: a capture artifact (window grown to 12,000 device px at dpr 3). The DOM has one
  masthead/library/27 cards and the view scrolls to its real end. Use pages/shoot.js --full (dpr 2) for tall shots.
- Fixed: title= tooltips on the four map controls; phone level cards cut the best off with an ellipsis.
- Looked at: shots/app/shell/co-*.png and shots/app/closeout/*.png (game, results, new and old-store players).
  The phone Europe map (whole world, offset) is the old map's behaviour (same in shots/baseline/m-03-europe.png).
- Dead-code sweep: pages/dead-css.js and pages/dead-js.js find nothing left over from the old menu.

## Stage: Stats and Settings pages

Status: DONE except the final smoke run and report (see "Last steps" below). Started from e7ed088.
Commits (all pushed): e7ed088 close-out of the previous stage, 889d356 Stats, 4cbf4a8 Settings + dialog + sync in
Settings, then a small follow-up (redraw on another tab's change).
Working files: `$S/work/integration/pages/` — shoot.js (view screenshots, stand-in sync server, --pages for tall
phone views, --syncfail=413), shoot-misc.js (toast, notice, loading card, banner, copy dialog), check-stats.js,
check-settings.js, dead-css.js, dead-js.js, errs.js. Screenshots: `$S/shots/app/pages/`.
Seed generator for later stages: `$S/harness/seed-rich.js` (`makeSeed()`; CLI writes harness/scratch/seed-rich.json
and seed-rich-unplayed.json). It plays ten weeks through the real mastery module under a fake clock.

### Done and verified
- Stats (`renderStats`, STATS section before GAME): figures, mastery table by collection and level (toggle per
  collection, remembered; folded on phones), 12-week calendar with weekly totals, Needs work + "Practice these"
  (`startWeakPractice` -> `startReview(groups)`), Daily Five (streaks, 30-day strip, score distribution), Pin the City
  (per-region bars, last 12 rounds), Personal records (table on desktop; `.recs` rows on phones, first 6 then
  "Show all"). Empty states on every panel. check-stats.js: desktop 86+ assertions, --mobile 114, all pass.
- Settings (`renderSettings`, SETTINGS section; drawn once, then only its controls are refreshed): theme tiles,
  Reduce motion switch (`setMotionPref`, atlas-motion), difficulty + map (same controls as Home via
  `renderDifficultySeg`/`renderMapSeg`/`syncPlayControls`), Sync card (`renderSettingsSync`, `syncRefreshEntry`
  updates the status line + nav light in place), Data (`downloadProgress`, `confirmReset`), About (`shareApp`).
- Dialog (DIALOG section): `openDialog(html)`, `closeDialog()`, `dialogContent(title, body, actions)`,
  `confirmDialog({title, body, confirm, danger, onConfirm})`, `copyDialog(title, text)`, `copyText(text, done, title)`.
  `#dialog` + `#dialog-scrim`. Used by the sync steps (`syncCreateDialog`, `syncCodeDialog`, `syncLinkDialog`),
  unlink, reset, and the copy fallbacks. No native alert/confirm/prompt is left in the file.
  The old sync modal (markup, `.sync-*` CSS, `syncOpenModal` and friends) is deleted.
- check-settings.js: desktop 5 groups all pass, --mobile 90 assertions pass. It covers theme/motion/difficulty/map,
  create/show/copy/username/errors (413, 503, offline)/unlink, linking a second device, a pull redrawing Stats,
  export (download parsed), reset dialog, and the reset reaching a second device through the stand-in server.
- Logic suites ($S/work/integration/logic-tests/run-all.sh): all green again (t1 37, t2 46, t3 39, t4 67, t5 4,
  t6 7, t7). Their old-menu selectors (`data-folder`, `.daily-card`, the focus chooser) had been stale since the
  Home commit; they and the sync adapters now speak Home / level sheet / Settings. Originals kept in
  logic-tests/_out/*.before-settings.js.
- shell/check-shell.js sync lines updated (sync is a Settings card + dialog now).

### Notes for later stages
- Sync UI ids kept for tests: #sync-now-btn, #sync-status-line (class `is-error` on failure), #sync-key-display,
  #sync-key-show, #sync-key-copy, #sync-username-edit, #sync-disconnect-btn; in dialogs #sync-username-new,
  #sync-create-btn, #sync-key-input, #sync-import-btn, #sync-import-status, #sync-code-full. The nav light is
  `[data-sync-dot]` (hidden when sync is off, `.is-error` after a failed push or pull).
- `state.worldFailed` is set when the world map can't load; renderHome shows the error, renderStats still draws.
- `reviewGroups(pick)` / `buildReviewPlaylist(groups)` / `startReview(groups)`: any set of names can be run as
  a practice playlist, not only what is due.
- Charts: no hover layer by design (owner rule); every value is printed. Column chart = `.cols`, bar = `.hbar`,
  calendar = `.cal`, figures = `.kpis` / `.figs`. Heat ramp `--h0..--h4`, mastery `--m0..--m3`.
- Unused-but-kept design-system utilities: .display-m, .display-s, .tnum (from the shell stage).

### Final state
- Status: DONE. Commits, all pushed to claude/determined-hamilton-w2lcbm: e7ed088 (close-out of the previous
  stage), 889d356 (Stats), 4cbf4a8 (Settings, dialog, sync in Settings), 231dffc (focus + redraw).
- On the final file: smoke.js 13/13 desktop and 13/13 --mobile; shell/check-shell.js 183/183 desktop (its layout
  check needed a longer key-press loop: seven reveals outlast 15 s) and 179/179 --mobile; pages/check-stats.js
  112 desktop, 114 --mobile; pages/check-settings.js 93 desktop, 93 --mobile; logic-tests/run-all.sh all green; syntax check and
  mastery paste check pass.
- Not done: CLAUDE.md / atlas_handoff.md still describe the old menu, the sync modal and no Stats/Settings.
  Game and results screens keep their old layout (only toast, hints, banner, loading card were restyled).

## Stage: game screen chrome and results screen

Status: IN PROGRESS (started from 231dffc, tree clean).
Working files: `$S/work/integration/game/` (CSS/markup fragments, splice scripts, shot driver). Screenshots: `$S/shots/app/game/`.

### Plan
1. CSS: replace the legacy "GAME SCREEN" .. "US mode backdrop" block and the 720px block with new sections
   (stage + SVG map on --g-* tokens, game bar, prompt card/choices/toast, actions/map controls/legend/hints, results).
2. Markup: #game-screen = .stage#map-wrap under .gamebar / .hud-top (#prompt + #toast) / .mapctl / .game-legend /
   .game-actions; #results-screen = .results-bar + .results (hero + #results-detail drawn by renderResults()).
3. JS: updateStats (progress, clock, legend), setPrompt, showToast icon, completed-second mark, picks log,
   mastery gain, stageInsets() for fitExtent, renderResults(r) fed by finishGame/finishPinGame/finishLearn.
4. Sweep dead CSS/JS, screenshots, smoke + suites, commit + push after each coherent piece.
