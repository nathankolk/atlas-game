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

Status: DONE (see "Final state of the game chrome and results stage" below). Started from 231dffc.
Working files: `$S/work/integration/game/` (CSS/markup fragments, splice scripts, shot driver). Screenshots: `$S/shots/app/game/`.

### Plan
1. CSS: replace the legacy "GAME SCREEN" .. "US mode backdrop" block and the 720px block with new sections
   (stage + SVG map on --g-* tokens, game bar, prompt card/choices/toast, actions/map controls/legend/hints, results).
2. Markup: #game-screen = .stage#map-wrap under .gamebar / .hud-top (#prompt + #toast) / .mapctl / .game-legend /
   .game-actions; #results-screen = .results-bar + .results (hero + #results-detail drawn by renderResults()).
3. JS: updateStats (progress, clock, legend), setPrompt, showToast icon, completed-second mark, picks log,
   mastery gain, stageInsets() for fitExtent, renderResults(r) fed by finishGame/finishPinGame/finishLearn.
4. Sweep dead CSS/JS, screenshots, smoke + suites, commit + push after each coherent piece.

### Second attempt (fresh agent, 2026-11-17) — what was found on arrival
- Checkpoint 95173e8 already holds step 1 (all game/results CSS spliced: sections "Game: ..." and "Results",
  phone block, tail) AND step 2 (markup: #game-screen and #results-screen are byte-identical to
  game/body-game.html). The fragments css-*.css, body-game.html and splice-css.py are SPENT; edit index.html directly.
- Uncommitted on arrival (JS only, parses with node --check): state.picks/roundLog/gainStart/clock, setGameChrome,
  setPrompt/setPromptTry/shakePrompt, startClock/stopClock, stageClearArea + fitExtent, roundProgress/updateStats,
  toast icon, foundMark/isMarked (completed-second), scoreAnswer(points, skipped), finishGame/finishPinGame/
  finishLearn all calling renderResults(r), the RESULTS section (js-results.js is spliced in; spent).
- NOT yet done on arrival (found by grep, see below as it is closed): handlers for the new buttons/data-actions,
  review mode against the new markup, leftovers that reference deleted ids, screenshots, suites, sweep.

- Orchestrator note, 00:02 UTC: the edits that were uncommitted when the first attempt was cut off are now commit 28d0c88 (a checkpoint on top of 95173e8, pushed). If the working tree looked dirty when you started and is clean now, that is why; `git diff 95173e8 28d0c88` shows that part.

- Orchestrator note, 00:14 UTC: a session hook requires a clean tree whenever the orchestrator pauses, so it committed your in-progress public/index.html as checkpoint e5d2554 and pushed it. Nothing in the file was changed. Your next commit will simply hold the changes made after it; describe the whole piece of work in its message all the same.
- 00:15 UTC: steps 1–3 are DONE and in the tree (orchestrator checkpoint e5d2554 holds them; smoke 13/13 desktop on it).
  Finished since arrival: results actions wired (`share-results`, `view-map` data-actions; `flashCopied`), review mode
  (`showRoundMap`), clock stop on leaving, resize keeps `.completed-second`, phone layout (controls stay a column
  lower right, tally lower left), countdown fills every `[data-countdown]`, `.outcomes` `--cols`, Learn results get a
  note and a "Play the full round" action (`#full-btn`), wrong-tap toast reads "Not quite — that’s X".
- Shot driver: `game/shoot.js` (see its header; uses logic-tests/lib.js with software compositing). Shots in shots/app/game/.
- logic-tests/lib.js: the "wrong target" pickers now skip `.completed-second` too (new mark class — adapter change).
- REMAINING (step 4): dead CSS/JS sweep, hardcoded colours, check script game/check-game.js, final shots in both
  themes and sizes, smoke desktop + mobile, logic suites, shell/pages checks, final commit + push, report.
- 00:33 UTC: commit f483d1b "Finish the game screen chrome and the results screen" pushed. On that tree:
  smoke 13/13 desktop and 13/13 --mobile (run just before the last small edits: tally swatches for city rounds,
  "Full round" label, dropped classes), game/check-game.js 109 desktop / 114 phone, logic suites t1–t7 green
  (t6 expectation updated: the pin country is in #prompt-note now), pages/check-stats 112, check-settings 93.
  Suite adapters updated for intended changes: lib.js (completed-second), t6 (prompt note), check-shell.js and
  check-stats.js (Next button uses the hidden attribute; kind tag #game-kind; .results-bar; share-daily action).
  The dated seeds were regenerated (the day rolled over at 00:00 UTC): harness/scratch/seed-rich*.json, shell/seed-*.json.
- STILL TO DO: rerun shell/check-shell.js desktop + mobile, smoke both once more on the final tree, the full
  screenshot matrix (game/shoot-all.sh), look at the dark/phone ones not yet seen, final report.

### Final state of the game chrome and results stage
- Status: DONE (see the commits after 231dffc: orchestrator checkpoints 95173e8, 28d0c88, e5d2554, then f483d1b and 794cdf9 (the closing commit; tree clean after it).
  All pushed to claude/determined-hamilton-w2lcbm.
- Checks on the final tree: smoke.js 13/13 desktop and --mobile; game/check-game.js 109 desktop, 114 --mobile;
  shell/check-shell.js 183 desktop, 179 --mobile; pages/check-stats.js 112 / 114; pages/check-settings.js 93 / 93;
  logic-tests t1–t7 and v-b4-learn green; syntax and mastery paste checks pass.
- Screenshots: shots/app/game/NN-<scene>-<d|m>-<light|dark>.png (16 scenes x 4), made by game/shoot-all.sh;
  t10-* are landscape phone and tablet.

### Notes for the globe stage (what the chrome expects of the map)
- `#map-wrap.stage` is absolute, inset 0, under the HUD. Put the globe canvas + overlay canvas inside it (the SVG
  `#world-map` and `#sat-canvas` can go). `.sat-credit` lives inside the stage and shows on `.stage.sat-on`.
- `stageClearArea(width, height)` returns the rectangle the HUD leaves free ({left, right, top, bottom} in stage
  px): fit / fly-to should aim at its centre, not the stage's (on a short window the card covers the middle top).
  It reads the laid-out HUD, so call it after `setGameChrome()` and `switchScreen('game')`.
- Map colours: `--g-*` tokens on :root / [data-theme=dark]; over imagery `.stage.sat-on` redefines them (and
  `--good/--second/--bad` for dots). `.stage.no-borders` = Uncharted. Pin Hard = `#game-screen.pin-hard`.
- Marks are still DOM classes on the SVG: `completed-correct` (first try), `completed-second` (NEW: second try),
  `completed-wrong`, `target-correct`, `target-wrong`, `reveal`, `prompt-highlight`, `learn-known`, `learn-new`.
  `foundMark(points)` picks the found class; `isMarked(el)` says an item takes no more answers. The resize handler
  re-applies them from the DOM; review mode ("View on the map", `showRoundMap()`) relies on the map being left as
  the round ended. A canvas globe needs this kept in JS.
- HUD API: `setGameChrome()` (title, tags, which figures/buttons, card shape; classes pin-mode, pin-hard,
  learn-mode, city-mode on #game-screen), `setPrompt(label, name)`, `setPromptTry(on)`, `shakePrompt()`,
  `updateStats()` (counter, progress line, score, tally), `roundProgress()`, `startClock()` / `stopClock(final)`,
  `showToast(kind, html)`, `setPinButton(label, disabled)`, `setLearnHint(on)`.
- Results API: `renderResults(r)` (shape documented above the function); `state.roundLog` (name -> {picks, skipped}),
  `state.picks`, `state.gainStart` (mastery snapshot at round start), `masterySnapshot()`, `renderGain()`.
- `zoom-hint` is `.map-hint--once` (fades once); `learn-hint` is a plain `.map-hint` (stays while shown).
- Known leftovers of the SVG map that the globe replaces: Europe frames the whole world (Russia crosses the
  antimeridian) and the sphere's edge shows inside the stage; the pin reveal centres on the stage, not on the
  clear area; zoom transitions ignore reducedMotion().
- Test adapters that know the SVG: logic-tests/lib.js (pathFor, wrongPath, clientPoint), harness/smoke.js MAP
  ADAPTER, game/check-game.js (uses lib.js; selectors `.country.completed-*`, `.city-dot.completed-second`).

## Stage: the game on the globe (M1–M5; several engineers in turn)

Working files of this stage: `$S/work/integration/globe-stage/` — `gshot.js` (screenshots; flags in its header,
`--plan=f,s,m,k,w` plays answers with real clicks through the smoke adapter, `--nogl` makes WebGL unavailable so the
engine's Canvas 2D renderer runs), `check-globe.js` (`--mobile`, `--only=picking,tiny,hard,input,view,review,imageryfail`),
logs `*.log`. Screenshots: `$S/shots/app/globe/`. Engine paste check: `logic-tests/check-globe-paste.js`.

### Round 1 (2026-11-17)

**M1 — DONE (world, the six continents, Daily Five on the globe).**
What exists in public/index.html now:
- The engine is pasted byte for byte between `/* ===...  * GLOBE ENGINE` and `/* ===== END OF GLOBE ENGINE ===== */`
  (just before the MASTERY module). `<script>` tags for /vendor/d3-array, d3-geo, topojson-client, earcut come first;
  the cdnjs d3 + topojson tags are STILL there for the SVG map (remove in M4).
- `#globe-host` inside `#map-wrap` (after `#world-map`). `.stage.on-globe` shows the host and hides the SVG and
  `#sat-canvas`. `state.onGlobe` is set per round in `startGame` from `playedOnGlobe(mode)` — **the switch to widen
  in M2/M3** (today: world-country and daily-five) and to delete in M4.
- New `MAP` section (before SATELLITE IMAGERY): `const map = { globe, layer, eligible, marks, shown, outlines, reveal,
  home, clear, ink, round }`; `initGlobe()` (called from `init()` once the 50m world is in; layer `world`, key
  `featureKey`, borders `state.worldBorders` = `topojson.mesh`), `applyMapLook()` (reads the `--g-*` tokens off the
  stage and calls `defineStyles` / `setTheme` / `setGraticule` / `updateLayer('world', borders…)`; called on theme
  change, map-style change, imagery failure), `featureStyle(key)` / `paintFeature(key)` / `paintMap()`, `canPick(key)`,
  `setupMap()` (per round: eligible set, clears marks, paints, hover rule), `placeGlobeHost()`, `boxOutline()`,
  `roundFrame()` (CONTINENT_FRAMES boxes; null = whole globe), `frameMap()`, `mapAtHome()`, `bringIntoView(target)`,
  `onMapClick(e)`, `drawMapOverlay` (reveal outline, Uncharted flash outline, reveal rings).
- Style names: land, dim, hover, found, second, missed (marks), good, bad (flashes), reveal, hidden. Marks live in
  `map.marks` (key -> 'found' | 'second' | 'missed'); `map.shown` overrides a mark for a moment (the reveal).
- **The globe's middle is the middle of the clear area**: `placeGlobeHost()` makes `#globe-host` reach past the
  stage's top or bottom edge by the difference (the engine always centres the globe in its host). So host px ≠
  stage px vertically; `map.clear` is the clear box in HOST px. `frameMap()` measures the frame's reach with
  `project()` and sets k itself (the engine's single `padding` cannot express an off-centre clear area), then
  `setOptions({ minZoom: min(1, whole), maxZoom: max(80, 60k) })`, `setView`, `setHome`. The whole-globe view lets the
  globe sit 10% under the prompt card and the actions (polar sea).
- `startGame`: `setupMap()` + `frameMap()` run before `switchScreen('game')` (so the globe fades in already right),
  and `frameMap()` again in the 80 ms start timer, BEFORE the first prompt (see M2). `switchScreen` pauses the globe
  off the game screen.
- Renderer-neutral verbs used by the answer handlers: `flashFeature(key, 'good'|'bad', ms, mark)`,
  `answerFeature(key)` (the old body of handleCountryClick), `revealTargetFeature(feature, toast)`; each has an
  `if (!state.onGlobe)` SVG branch (classes via `svgFeature(key)`, `SVG_MARK`, `SVG_FLASH`) to delete in M4.
  `foundMark(points)` now returns 'found' | 'second' (city dots map it through `SVG_MARK`).
- Satellite on the globe already works for globe rounds: `applyMapStyle()` → `applyMapClasses()` + `applyMapLook()` +
  `globe.setImagery(...)`; `onImageryStatus(status)` drives "Loading imagery…", the failure toast and the fall back
  to the chart look. Uncharted on the globe: borders off, no hover hand, flash outline on the overlay.
- zoomBy / zoomReset / the resize handler branch on `state.onGlobe`.
- Hook: `window.__atlas.map` and `window.__atlas.globe` (getter).
- Hint pill now reads "… drag to turn the globe".

Tests changed for the globe (none weakened):
- `harness/smoke.js` MAP ADAPTER has a globe half (gLocate / gAim / gAtHome …) chosen per round by `state.onGlobe`;
  the SVG half stays until M4. Globe: no trial tap, no view reset after an aimed answer, no synthetic fallback.
  Pin (`pinPoint`, `farPoint`) and city dots are SVG-only so far — **extend in M2/M3** (dots: expose their lon/lat,
  e.g. on `map`). A copy of the file from before: `harness/smoke.before-globe.js`.
- `logic-tests/lib.js`: `T.keyFor`, `T.tapAt` (dispatched PointerEvents on the host), `T.aimKey`, `T.tapKey`,
  `T.wrongKey`, `T.marks()`, `T.mapEl()`; `T.attempt` and `startLevel` branch on `state.onGlobe` (ready = map.round
  matches AND the layer is built: `globe.stats().triangles > 0` — a tap before the build finds nothing).
- `t3-links-b4-d6.js` and `game/check-game.js` read marks through `T.marks()` and the map's box through `T.mapEl()`
  ("the map covers the stage" instead of "fills": the host overhangs by design).

Verified (logs in globe-stage/): smoke 13/13 desktop and 13/13 --mobile; check-globe 39/39 desktop, 37/37 phone
(picking rules incl. Barbados / Bahrain / Greenland, Hard keeps no marks, double tap = two answers and no zoom, a drag
answers nothing, hover hand, + - 0 and the buttons, Europe's frame inside the clear area, M keeps marks, resize refit,
review mode inert with marks, imagery failure). Screenshots looked at: m1-world-d-light, m1-africa-d-light,
m1-europe-m-dark, m1-reveal-d-light, m1-africa-sat-d, m1-unch-d, m1-world-m-light.

**Traps found**
- A tap in the first ~200 ms after page load, before the 50m layer is built, hits nothing (tests must wait for
  `globe.stats().triangles > 0`).
- With `fast: 25` in lib.js the 2600 ms reveal lasts 104 ms: read reveal state in the same `evaluate` as the tap.
- Do not edit public/index.html while a suite is running: the harness serves the file live.

**M1 committed and pushed: 57951e4.**

**M2 — DONE, committed and pushed: 568c5ed.** Verified on that tree: smoke 13/13 desktop and 13/13 --mobile (real
clicks and taps, 0 synthetic); check-globe 56/56 desktop, 54/54 phone; check-game 110/110 desktop, 115/115 phone;
logic run-all (t1–t6) all pass; both paste checks pass.
What M2 added to public/index.html:
- `playedOnGlobe(mode)` is now `mode !== 'city-pin'`: only Pin the City still uses the SVG map.
- Layers: `syncMapLayers()` hands the globe `world`, `us` (once `state.usLoaded`; polygon rings as borders) and `prov`
  (the store of the province country played last, `map.provinces`; `store.borders` = `topojson.mesh`, kept by
  `loadProvinceData`). It calls `globe.setLayers`, which resets EVERY layer's config, styles and hover — so it runs
  before a round is set up, never during one; `map.layerSet` makes it a no-op when nothing changed; `map.drawn` is
  true once the maps are built. `startGame` awaits it (the "Loading…" overlay stays up) before the round begins.
- `setupMap()` now: `map.layer = DATASET_LAYER[state.activeDataset]`; the round's layer visible and (when answers are
  given on shapes: `answersOnShapes()`) interactive with the hover style; `world` visible under it as scenery;
  `paintContext()` paints that world layer all `dim`, and over imagery sets the parent country `hidden`
  (`PROVINCE_COUNTRIES[*].parents`, or the USA) so it does not darken the see-through states above it.
- Frames (`roundFrame()`): US modes open on the lower 48 (`US_FRAME`; Alaska and Hawaii are a turn away — looked at on
  desktop and phone; on a phone Alaska is in view); cities and provinces fit their eligible features.
  `frameMap()` measures any GeoJSON with `eachPosition`. In the 80 ms start timer `frameMap()` now runs BEFORE the
  first prompt, so the turn a first prompt asks for (States → Capitals: Hawaii) is not undone.
- States → Capitals: `setPromptFeature(feature)` (`map.promptKey` → style `prompt`, an outline of kind `prompt`,
  `bringIntoView`). A mark shows before the prompt tint (B5).
- City dots: `map.dots` ({ name, lonlat }), `map.dotMarks`, `map.dotShown` (flash / reveal with an end time),
  `map.dotHover`; `drawCityDots`, `dotNear(x, y, reach)` (nearest dot wins: B9), `answerCity(name)`,
  `revealMissedCity(name)`, `flashDot`, `onMapMove` (hover via the engine's `move` event).
- Learn: `map.tints` (learnKnown / learnNew), outline of kind `learn` on the newest, `map.labels` laid out by
  `placeLearnLabels()` with `globe.anchor` + `anchorRadiusDeg` (room × the anchor's facing `p.z`), re-laid on the
  engine's `settle`, on resize and at each level; `drawLearnLabels`; `clearLearnStudy()`. `gapY` is now `h/2 + 6`
  (the checklist's quirk fix). Names behind the globe are neither drawn nor counted for the pill.
- `bringIntoView(target, { keepZoom })` returns the zoom it left when it zoomed in on a speck; a reveal flies back
  out to it when it ends. Learn level starts pass `keepZoom`.
- Gone with their last users: `handleCountryClick`, `handleCityClick`, `highlightPromptedState`, `isMarked`,
  `svgFeature`, `SVG_MARK`, `SVG_FLASH`, `showRevealMarker`, `showRevealMarkerAtCoords`, `ensureCoordsVisible`,
  `learnLabelAnchor`, `poleOfInaccessibility`, `scaleLearnLabels`, `CITY_DOT_BASE_RADIUS`, the SVG branches of
  `flashFeature` and `revealTargetFeature`, the city-dot block and click bindings in `renderMap`.
  STILL THERE for Pin the City: `renderMap`, `ensureFeatureVisible`, d3.zoom, the whole SATELLITE IMAGERY CPU code,
  the SVG CSS (incl. now-dead `.city-dot`, `.learn-label`, `.reveal-marker`, hit-zone rules), the resize handler's
  SVG branch, the cdnjs tags, `ensureTopojson`, the us-atlas CDN fallbacks, `parallels` in PROVINCE_COUNTRIES.

Tests changed in M2 (none weakened): smoke adapter — dots (`gLocateDot`, `gDotAt`), ready = `map.round` matches and
`map.drawn`; lib.js — us-city taps on the globe, `T.marks()` counts dot marks, `T.zoom()`; check-game.js — capitals B5
is now "the prompted state takes its mark at once" read from `map`, marks through `T.marks()` / `map.dotMarks`, the
clock checks set `startTime` absolutely and the zoom check waits for the eased view (software rendering stretches
animations: the engine caps a frame's dt at 50 ms); t3 aborts `/countries-(50|110)m.json` for D6; t6's copy links
`vendor/`. check-globe.js gained groups `us` and `provinces` (prompted state in view incl. Hawaii and Alaska, DC is
no answer, nearest of two crowded dots, Lakshadweep / Puducherry / Andaman tappable at the opening view, a province
of another Russia round is no answer, Learn names / pill / zoom-in / quiz clears them).

Screenshots looked at for M2: m2-us-d-light, m2-capitals-m-light, m2-cities-d-light, m2-india-learn24-d-light,
m2-russia-south-sat-d.

Known warts so far
- Russia rounds over imagery: Crimea (in the world file's Russia, not in the province file) shows as untinted
  imagery, the same brightness as the round's own provinces. A tap there does nothing.
- check-game "hud: the prompt card kept its size" compares width too and fails when one of the first questions has a
  long name (the card widens for it). Seen once on desktop; not caused by the globe.
- After a reveal that zoomed in on a speck the globe zooms back out but stays centred on the place.

**Remaining (in order)**
- M3: Pin the City on the globe, then satellite / Uncharted checked in every mode. A recipe for the pin part:
  - `playedOnGlobe` → true for every mode (then delete it and `state.onGlobe` in M4).
  - `onMapClick`: before the `interactionLocked` test, `if (state.pin) { if (state.pin.phase === 'aim' && state.current
    && e.lonlat) { state.pin.guess = e.lonlat; setPinButton('Drop pin', false); map.globe.invalidate(); } return; }`
    (`e.lonlat` is null for a tap off the globe). `handlePinClick` and its round-trip test go.
  - `drawPinLayer()` becomes an overlay step reading `state.pin` each frame (checklist 4.3: teardrop
    `new Path2D('M0,0 C-2,-6 -8,-10 -8,-16 A8,8 0 1 1 8,-16 C8,-10 2,-6 0,0 Z')` translated to the guess, truth ring +
    dot + name label, `globe.draw.geoLine(ctx, guess, truth, { color: map.ink.label, width: 1.5, dash: [5, 4] })`);
    its four call sites become `map.globe.invalidate()`. Colours: the CSS rules `.pin-guess`, `.pin-truth-*`,
    `.pin-line` name the tokens (`--g-wrong`, `--g-halo`, `--g-label`, `--g-select`); add what is missing to `map.ink`.
  - `roundFrame()`: `pinFitGeometry(region)` for a continent, null (whole globe) for World.
  - `applyMapLook()`: `bordersVisible` also false for Pin on Hard (`#game-screen.pin-hard`).
  - `pinReveal`: replace the `currentTransform` / `ensureFeatureVisible` lines: when guess and truth are under ~120°
    apart bring both into view (fit the two points, never zooming in past the current zoom), else
    `bringIntoView(truth)`.
  - Tests: smoke adapter `pinPoint` / `farPoint` need globe versions (`project` / `invert`, turn with `setView` when
    the place is hidden); lib.js `T.clientPoint` and the pin click dispatch in `answer()` (use `T.tapAt`);
    check-game.js lines that click `#world-map` for pin.
  - `supportsImagery()` false (Canvas 2D): show Satellite and Uncharted as unavailable with a short reason (Home's
    Library controls, the level sheet, Settings' default map style, the in-game layers button, the M key).
- M4: delete the SVG renderer, d3.zoom, projections, CPU satellite code and CSS, the CDN tags, `ensureTopojson`,
  the SVG halves of the test adapters; 110m first paint then 50m; resize / rotation; reduced motion (the engine only
  reads the OS setting — the game passes `animate: false` / `duration: 0` from `reducedMotion()`; inertia and wheel
  easing still follow the OS setting only); lost WebGL context; a full round with Canvas 2D (`gshot.js --nogl`).
- M5: measurements, and the old app at commit 1c74e1d for comparison.
- Docs: CLAUDE.md / atlas_handoff.md still describe the SVG map and the CPU satellite canvas.

### State at hand-over (end of round 1)
- Branch `claude/determined-hamilton-w2lcbm` is pushed at 568c5ed; the working tree is clean. M1 and M2 are done.
- Next engineer: start at **M3** (recipe above), then M4, M5. Nothing of M3–M5 has been started.
- `startGame` now awaits `syncMapLayers()` for every globe round, so a round never begins on a map that is still being
  built (an intermittent lost first tap on phones came from that; fixed and re-run).
- Trap: `startGame` is asynchronous for every globe round (one await, even when the map is already built), so test
  code must wait for `state.current`, never read it straight after calling `startGame`.
- Not yet looked at as screenshots: review mode ("View on the map"), the Canvas 2D fallback (`gshot.js --nogl`),
  Hard, Daily Five in dark (taken, not opened), US capitals in dark (taken, not opened), a phone on its side.
- CLAUDE.md and atlas_handoff.md are untouched and now wrong about the map (SVG, projections, CPU satellite canvas,
  CDN libraries); fix them in the docs pass after M4.

- Orchestrator note, 05:03 UTC: round 2 was cut off by the usage limit about four minutes in (02:27 to 02:31 UTC). Its uncommitted edits (the first steps of the Pin the City recipe; both script blocks parse) are now checkpoint 49ca4bd on top of 568c5ed, pushed. Not tested.

### Round 2 (2026-11-17, replacement for the engineer cut off at 02:31 UTC)
Found on arrival: tree clean at checkpoint 49ca4bd (568c5ed + an untested draft of the first Pin the City steps:
`playedOnGlobe` true for all modes, pin branch in `onMapClick`, `drawPins(ctx)` overlay step, `showPinMiss`,
`restorePinView`, `roundFrame()` via `pinFitGeometry`, borders off for Pin Hard). Nothing in it had been run; the Pin
test adapters (smoke `pinPoint` / `farPoint`, lib.js `T.clientPoint`, check-game pin lines) were untouched.
Plan for this round: review + run the draft (M3 pin), satellite/Uncharted per mode + "unavailable" on Canvas 2D,
commit; then M4 (delete SVG renderer etc.), M5.

- Orchestrator note, 05:08 UTC: a session hook requires a clean tree whenever the orchestrator pauses, so it committed your in-progress public/index.html as checkpoint bcf49f1 and pushed it. Nothing in the file was changed. Your next commit will hold the changes made after it; describe the whole piece of work in its message all the same.

**M3 — DONE, committed and pushed (see `git log`: "Play Pin the City on the globe; lock Satellite and Uncharted…").**
- Pin the City on the globe: `onMapClick` pin branch, `drawPins(ctx)` (overlay; the name goes under the spot when the
  pin stands over it), `showPinMiss(guess, truth)` (fly so truth — and the guess when < ~120° apart — is in the clear
  area, never zooming in), `restorePinView()` (back to the pre-reveal view for the next city unless the player moved
  the globe: `state.pin.back = { view, shown }`), `roundFrame()` → `pinFitGeometry`, borders off for Pin Hard.
- No imagery (Canvas 2D): `imageryAvailable()`, `applyImagerySupport()` (called from `initGlobe`, the engine's
  `renderer` event and `startGame`), `NO_IMAGERY_NOTE`, `[data-imagery-note]` in Home's playbar, the level sheet and
  Settings; `syncPlayControls()` disables Uncharted and Satellite; `satEnabled()` is false; `#map-style-btn` hidden;
  a saved Uncharted plays as Hard for the visit (not saved).
- Share text time: `state.roundSeconds` (set in `finishGame`) instead of the clock at the moment Share is pressed.
- Tests: lib.js is globe-only now (`T.pinTap`, no SVG helpers, `noPaint` ignored); check-game pin lines and
  v-b4-learn read the globe; check-globe.js has new groups `pin`, `imagerymodes` (7 round kinds × satellite and
  Uncharted), `noimagery`; gshot.js has `--pin=near,off,far,drop,next,skip` and `--off=`.
- Verified on that tree: smoke 13/13 desktop and --mobile; check-globe 123/123 desktop, 121/121 phone; check-game
  110 desktop (after the share fix; one run under load had failed on the share time), 115 phone; logic t1–t6,
  v-b4-learn, both paste checks. Screenshots looked at: m3-pin-europe-drop-d-light, m3-pin-world-far-d-dark,
  m3-pin-asia-unch-m, m3-pin-europe-hard-d-dark, m3-pin-asia-near-m, m3-us-sat-d-dark, m3-capitals-unch-d,
  m3-nogl-world-d-light.
- STILL IN THE FILE (dead now, delete in M4): `playedOnGlobe`, `state.onGlobe`, `renderMap`, `ensureFeatureVisible`,
  the CPU satellite code, SVG CSS, `#world-map`, `#sat-canvas`, cdnjs tags, `ensureTopojson`, us-atlas fallbacks,
  `parallels`, the resize handler's SVG branch.

**M4 — DONE, committed and pushed in two commits ("Remove the SVG map and the CPU satellite renderer", "Globe edges: …").**
- Gone: `renderMap`, `ensureFeatureVisible`, d3.zoom and every projection, the CPU satellite code (`sat` keeps only
  `failed`), `#world-map`, `#sat-canvas`, all SVG map CSS, `.on-globe`, `playedOnGlobe`, `state.onGlobe`, the SVG state
  fields, `ensureTopojson`, the cdnjs tags, the us-atlas CDN fallbacks (`US_STATES_URL` only), `parallels`.
  The page loads scripts from /vendor/ only (check-edges `network`).
- 110m first paint: only for a level link. `linkedLevel()` parses `?play=` once in `init()`; `showOpeningGlobe()` fetches
  `/data/countries-110m.json` (`loadWorldSketch()` → `map.sketch`), creates the globe with it, shows the game screen
  with `#game-screen.is-opening` (everything but the stage hidden) and a bare loading card; when 50m is in,
  `initGlobe()` → `syncMapLayers()` swaps the world layer (the engine keeps drawing the old layer until the new one is
  built) and `startGame` takes over (`setGameChrome` removes `is-opening`). A Home-first visit never fetches 110m.
- Engine change (globe.js, pasted again; `globe.before-motion.js` is the copy from before): `setOptions({ reducedMotion:
  true | false | null })`, also at create. Engine tests: full run 290/291 with my own new check wrong (it read the
  zoom synchronously); fixed and the two groups touched re-run (view 22/22, drag 10/10). The app: `applyMapMotion()`
  (called from `initGlobe` and `setMotionPref`).
- Renderer fallback mid-round: the `renderer` handler in `initGlobe` re-applies the map style and shows the imagery
  notice.
- Resize handler is globe-only (refit when `mapAtHome()`, else `placeGlobeHost()`; Learn labels laid out again).
- New suite `globe-stage/check-edges.js` (`--only=opening,network,resize,motion,context`), 37 checks.
- check-game.js: the two "card kept its size" checks for the find-a-place and pin cards now compare height only (a
  long name widens the card by design; it had failed intermittently since round 1); `on-globe` dropped from two
  expected class lists.
- Verified on the final M4 tree: smoke 13/13 desktop and --mobile; check-globe 123 / 121; check-game 110 / 115;
  check-shell 183 / 179; check-stats 112 / 114; check-settings 93 / 93; logic t1–t6, v-b4-learn, both paste checks;
  check-edges 37/37 (resize group re-run alone after one timing failure under three parallel suites).
- Screenshots looked at: m4-opening-d, m4-opening-m, m4-rotated-m, m4-review-d-dark, m4-nogl-us-cities-d-dark.

**M5 — DONE (measured; nothing in the app changed for it).** Tools: `globe-stage/measure.js` (flags in its header;
`--stock-gpu` keeps the harness's Chromium flags), `globe-stage/tmp/timeline.js`; raw output `measure-softcomp.log`,
`measure-results-softcomp.json`, `measure-results-stock.jsonl`. Old app = commit 1c74e1d extracted to
`globe-stage/old-app/public`. Same in-page input for both apps: a 120-frame drag (4 px a frame) and 120 wheel notches,
one event per animation frame, on `?play=world`. This machine has no GPU: WebGL runs on SwiftShader (software).

Per frame while turning and zooming the 50m world (new app; identical within noise for desktop 1280×800 and phone
390×844 @2x, chart and satellite):
- engine's own draw call (`stats().lastFrameMs`): median 0.2 ms, p95 0.3–1.3 ms;
- all script on the main thread: 0.4–0.7 ms per frame; all main-thread work: 2.3–2.6 ms per frame (stock flags);
- after the gesture ends (3 s): 2–8 ms of script (imagery window rebuild included).
Old app, same input: script 0.2–0.4 ms per frame, main thread 3–20 ms per frame (style, layout and paint of the SVG);
after the gesture 8 ms (chart) / 47–51 ms (satellite reprojection) of script.

Frame intervals IN THIS SANDBOX (not what a device with a GPU does):
| flags | new, chart | new, satellite | old, chart | old, satellite |
| software compositing (`--disable-gpu-compositing`, what the suites use) | 350–420 ms | 270–470 ms | 16.7 ms turn, 33 ms zoom (p95 100) desktop; 16.7 phone | 16.7 ms |
| harness stock (GPU compositing on the software GL driver) | ~200–217 ms | ~200 ms (desktop chart trial) | turn: median 2.8 s, p95 6.1 s; zoom: median 50 ms, p95 18 s (desktop chart; the other three old cases were not waited for) | not run |
With software compositing every WebGL frame is drawn by the CPU and read back on the main thread (main-thread task
≈ the whole frame, 350–420 ms); the old app's SVG is cached as tiles there and pans at the display rate. With the
stock flags the globe's main thread is nearly idle (2.3–2.6 ms) and the 200 ms is the software GL driver; the old
app's raster goes through the same driver and takes seconds per frame.

Navigation → first question answerable (`?play=world`, local server, median of 3):
| flags | new desktop | new phone | old desktop | old phone |
| stock, chart | 793 ms | 825 ms | 578 ms | not run |
| stock, satellite | 889 ms | 920 ms | not run | not run |
| software compositing, chart | 2307 ms | 2347 ms | 679 ms | 574 ms |
| software compositing, satellite | 2734 ms | 3092 ms | 684 ms | 625 ms |
Timeline, stock flags, 3 runs each (ms after navigation): with the opening globe the globe is on screen at 360–551,
the 50m map is built at 634–893, first prompt at 719–979; without it (commit 70b7af5) the game screen comes up at
676–725 and the first prompt at 762–808. So the opening globe costs the first prompt nothing measurable and shows a
globe about 300 ms sooner even with no network delay. Engine build of the 50m world: 147–160 ms of CPU.
The old app's figure does not include its first paint (its paths exist and the prompt is up before they are drawn).

### State at the end of round 2 — the globe stage is COMPLETE (M1–M5)
- Branch pushed at ff7c3e7 (902fde5 M3, 70b7af5 + 7793090 M4, ff7c3e7 CLAUDE.md map sections); tree clean.
- Final-tree runs: smoke 13/13 desktop and 13/13 --mobile (logs `globe-stage/smoke-final-*.log`); the other suites as
  listed under M4 (the only app change after them was none; CLAUDE.md is not served).
- Not done: atlas_handoff.md (still describes the SVG map); CLAUDE.md is updated for the map, satellite, level-link
  and Pin the City paragraphs only (older drift listed by earlier stages remains). The engine's source and tests
  live only in `$S/work/globe/` — the repo holds the pasted copy.
- Not verified: a real GPU, real Esri tiles, the live site. Engine full test file was run once after the
  reducedMotion change (290 of 291; the one failure was the new check itself, fixed, and only the `view` and `drag`
  groups were re-run). Screenshots taken but not opened: m4-context-restored-d, m4-context-fallback-d,
  m4-hard-asia-m-light, m4-review-rotated-m, m3-cities-sat-m, m3-india-unch-d-reveal.
- Known warts unchanged: Crimea in Russia rounds over imagery; on a phone on its side the prompt card covers the top
  of the map's clear area (stageClearArea's short-window rule); the found mark over imagery cannot be judged on the
  green stand-in tiles.

## Stage: Capitals, Flags, Name It (three new ways to learn the world's countries)

Status: IN PROGRESS (started 2026-11-17 14:15 UTC from 1b0c32f, tree clean, nothing of this stage existed).
Working files: `$S/work/integration/modes/` (check-modes.js = this stage's suite, shoot-modes.js = screenshots).
Screenshots: `$S/shots/app/modes/`. Paste checks: `logic-tests/check-quiz-paste.js`.

### Plan (commit + push after each)
1. Pieces: quiz.js pasted (section QUIZ LOGIC, column 0, before MASTERY), WORLD_FACTS + COUNTRY_TYPED_ALIASES
   pasted (section WORLD FACTS), font to public/vendor/, @font-face 'Atlas Flags', paste check.
2. Modes: GAME_MODES capital-pick / capital-find / flag / name-it; QUIZ_ROUNDS; LEVELS (+variant); play logic; HUD.
3. Library (three collections, Capitals switch, flags unavailable), level sheet, mastery skills, Smart Review hosts,
   Stats, Settings credit.
4. Suite check-modes.js, seed-rich.js extended + payload size, screenshots, all suites, report.

### State at 14:50 UTC (commits 7702a54 checkpoint, f86b9cd; more edits after it uncommitted until the next commit)
DONE in public/index.html (all parse; check-modes.js desktop 176/176 over its groups, phone 169/170 with the one
failure a timing slip in the test itself, since fixed):
- Pasted: `QUIZ LOGIC (quiz.js)` at column 0 right after `END OF MASTERY MODULE`; section `WORLD FACTS` (world-facts.js
  two spaces in, up to `/* ===== END OF WORLD FACTS ===== */`) before US STATES; font `public/vendor/TwemojiCountryFlags.woff2`;
  `@font-face 'Atlas Flags'` in the Type CSS; `--font-flags` set from `Quiz.FLAG_FONT_STACK` in `init()`.
  Paste check: `logic-tests/check-quiz-paste.js` (in run-all.sh, with check-globe-paste.js).
- Registry: `QUIZ_KINDS` (capital-pick, capital-find, flag, name-it: slug, collection, variant, skill, noun, asks) and
  `QUIZ_ROUNDS` (level key -> { mode, region }) after GAME_MODES; four GAME_MODES entries; `quizNames(mode, region)`;
  28 LEVELS (arg = key; `variant` 'pick' | 'find' on the Capitals levels; flag levels have an `available` getter on
  `state.flagsOff` and `why`); COLLECTIONS capitals (with `variants`), flags, name between provinces and pins;
  `levelFullTitle(level)` ("Europe · Find the country") for Stats. LEVELS = 55, 52 playable.
- Play: `startGame` (flag rounds await `flagsReady()`; `state.quiz` = { rng, pool } or { matcher }), `nextCountry`
  branches, `answersByChoice()`, `capitalFor(name)`, `renderCapitalChoices` (Quiz.capitalChoices for countries),
  `acceptedAnswers()` + twins and shared capitals in `answerFeature`, `flagHtml(name)`, Name It: `resetAnswerField`,
  `focusAnswerField`, `showTypedAnswer`, `rejectTypedAnswer`, `acceptTypedAnswer`, `submitTypedAnswer`, `onAnswerInput`;
  toast kind 'note' (not counted); `setPromptFeature` -> `turnToCountry(feature)` on the world layer (`projectInView`,
  `PROMPT_MIN_PX`); `followKeyboard()` (visualViewport -> #game-screen top/height + `.kb-open`), `refitMapSoon()`.
- Keys: in Name It every printable key goes to the field, Escape skips (Skip's key cap `#skip-key` says Esc); elsewhere
  as before. mousedown on Skip / the globe / map buttons keeps the field focused.
- Markup: `#answer-form` (`#answer-input`, `#answer-btn`) in `#prompt`; icons i-capitol, i-flag, i-type.
- Home: `collectionVariant()` / `saveCollectionVariant()` (localStorage `atlas-capitals-way`), `set-variant` action,
  `#library-count` redrawn with the collections; unavailable card shows `level.why` + "Unavailable".
- Sheet: `MODE_DIFFICULTY_DESCS` (replaces PIN_DIFFICULTY_DESCS; `data-difficulty-note` = the level's mode), MODE_HOW,
  eyebrow names the variant, a flag level's sheet calls `flagsReady()`.
- Mastery: skills capital / flag / country-name; REVIEW_HOSTS capitals-world, flags-world, name-world; skillLabel.
- Settings About: Flags credit. Hook: `window.__atlas.Quiz`, `.WORLD_FACTS`, `.COUNTRY_TYPED_ALIASES`.
- Stats: mastery table rows use levelFullTitle; the three quiz collections start folded on desktop too.
Test tools: `modes/check-modes.js` (groups registry, pick, find, flag, name, keys, difficulty, library, noflags,
review, results, keyboard[--mobile only]); `modes/shoot-modes.js [--mobile] [--dark] [--only=scene]`;
`modes/measure-payload.js` (heavy seed -> POST body size); `logic-tests/lib.js` T.attempt knows capital-pick and name-it,
`T.typeAnswer`. `harness/seed-rich.js --quiz` (seed-quiz.json) and `--heavy` (seed-heavy.json); default seed unchanged.
Numbers: heavy player payload 126.6 KB of 256 KB (before capping its pin games at the app's 200; re-measure).
Totals: places mastered denominator 609 -> 1,158 (+184 capital, +181 flag, +184 country-name).

Later the same day (commit 6aaeacb, pushed; one small edit after it: the unknown-name toast wording):
- Prompt labels: "Which city is the capital of", "Which country’s capital is", "Which country’s flag is this",
  "Name this country" (short enough to share a phone card's line with "· Second try"; the label now gives way with
  an ellipsis before the marker is cut). Flag prompt 120 px desktop / 96 px phone.
- `flagsReady()` looks again when a slow font finally loads. LEVELS entries all carry `variant` and `why` (null by default).
- CLAUDE.md: a paragraph on the country quizzes, the font in the repo layout.
- Suites updated because they were out of date with intended changes (none weakened): t1 (55 levels; the 27 old slugs
  still checked as a set), t3 (55), t5 (records and focus regions for the new modes; "under half the limit" is now
  "under 200 KB"), check-stats (seven collections, 52 level rows, Capitals rows named with their set),
  check-shell (cards on show = playable levels of the set the Capitals switch has on).
- ALL SUITES on that tree: check-modes 163 desktop / 170 phone; smoke 13/13 desktop and --mobile; check-shell
  246 / 242; check-stats 168 / 170; check-settings 93 / 93; check-game 110 / 115; check-globe 123 / 121;
  check-edges 37; logic run-all (syntax, three paste checks, t1 38, t2 46, t3 39, t4 67, t5 4, t6 7); t7; v-b4-learn 10.
  Runner: `modes/run-suites.sh` (writes modes/suites.log and modes/suites/*.log).
- Payload: heavy seed (`seed-rich.js --heavy`) 126.6 KB before the pin cap fix (re-measure); worst case the app can
  produce (t5) 156.7 KB of 256 KB (was 106 KB).

### Final state of this stage
- Status: DONE. Commits on claude/determined-hamilton-w2lcbm, all pushed: 7702a54 (checkpoint), f86b9cd, 6aaeacb,
  4bf934c (final; tree clean after it).
- Payload: heavy player of `seed-rich.js --heavy` (every level played daily for 57 weeks, all 1,158 items seen, 136
  record keys, 200 pin games) = 122,024 bytes (119.2 KB) of 256 KB. The largest the app can produce (t5: every store
  at its cap, 147 record keys, every focus list half full) = 156.7 KB (it was 106 KB before this stage). Both under 200 KB.
- Totals: "Places mastered ... of N": N went from 609 to 1,158 (184 capitals, 181 flags and 184 country names added;
  each skill's names once, as US capitals were already counted beside US states).
- Screenshots: `$S/shots/app/modes/<scene>-<d|m>-<light|dark>.png` (pick-, find-, flag-, name-1..4; name-5/6 keyboard
  (phone); name-7 / pick-5 uncharted; pick-6/7 world; library-1..4; sheet-*; results-*; stats-1..3; settings-credits).
  In-play shots are taken with the page's delays stretched (a capture takes a second or more here).
- The full chain was run twice: on 6aaeacb's tree (all green but check-shell's card count, an out-of-date expectation,
  then fixed and green) and again on the final tree 4bf934c (modes/suites.log; the first run is suites-first-run.log):
  smoke 13/13 desktop and --mobile; check-shell 246 / 242; check-stats 168 / 170; check-settings 93 / 93; check-game
  110 / 115; check-globe 123 / 121; check-edges 37; logic run-all all green; v-b4-learn 10; t7 passes. check-modes
  failed one assertion in that run on both sizes ("keys: Enter submits": the test read the lock after the next
  question was already up); the test was corrected and check-modes re-run on the same tree: 163 desktop, 170 phone.
- Decisions worth knowing: text that is no name in the atlas costs no try in Name It; Escape skips there (S is a
  letter); a shared-capital tap (Cyprus for North Nicosia, Israel for Ramallah) is not counted either way; a twin's
  tap (Romania for Chad's flag, Northern Cyprus for Nicosia) is right and the mark goes to the country asked for;
  Hard in Capitals-pick is honest about being the same questions without marks.
- Not done / not verifiable here: real phones' keyboards (focus at round start may need one tap on iOS; whether a
  keyboard's own word suggestions are suppressed by the field's attributes), Safari / Firefox, Windows without the
  flag font. atlas_handoff.md is untouched. The Afghanistan flag question from the quiz stage stays with the owner.


## Stage: Explore view, and Learn for more levels

Status: DONE. Built 2026-11-17 16:40–17:16 UTC from 4bf934c (commits 1628408, 8a4be64, e97df55, fd779a9, all pushed).
The first agent was stopped during its last suite run; a second agent finished that run at 21:15 UTC and wrote the
final state below. The second agent changed nothing in the repo: public/index.html is byte for byte fd779a9's.
Working files: `$S/work/integration/explore/` (nb-raw.js = neighbours straight from the topology, check-explore.js =
this stage's suite, shoot-explore.js = screenshots). Screenshots: `$S/shots/app/explore/`.

### Plan (commit + push after each)
1. Learn for the six continent levels and States (LEVELS `learn: true`; ladder key = level key). Small.
2. Explore: VIEWS entry + `#explore-screen` (stage `#explore-stage`, host `#explore-globe`; the one globe moves there
   with `globe.attachTo`), EXPLORE section (after SATELLITE IMAGERY): place card, neighbours from the topology,
   search, Colour by + legend, deep link `#explore=<slug>`, keys, Stats link.
3. Suite check-explore.js, screenshots (desktop/phone, both themes), all suites, CLAUDE.md paragraph, report.

### Decisions
- Neighbours: `topojson.neighbors` on the 50m file, checked by hand against all 184 countries (not just twenty):
  it is right everywhere except two real borders the 50m shapes do not draw (Botswana–Zambia at Kazungula,
  Morocco–Spain at Ceuta and Melilla), which are added by a two-line table. Neighbours that are not countries of
  this atlas are left out, except the five European microstates (Andorra, Liechtenstein, Monaco, San Marino,
  Vatican City), shown as plain chips so that France or Italy's list is complete.

### What was built (commits 1628408 Learn; 8a4be64, e97df55, fd779a9 Explore)
In public/index.html, verified by `explore/check-explore.js` (192 desktop, 192 phone on the final tree):
- **Learn widened**: `LEVELS[].learn` (true for the six continents, `us-state`, the province levels); the sheet, the
  Home card ("Learning · level n of N"), `linkedLevel()` (`&learn=1`) and `startGame` all read it. Ladder key =
  `level.key` (`state.learn.levelKey`; was `roundKey`). `learnAnchor(feature)` / `anchorInBox(feature, box)`: on a
  continent a name whose engine anchor is outside `CONTINENT_FRAMES[...]` goes on the part of the country the frame
  holds (Russia in Europe); `run.anchors` caches it. `finishLearn` label = the mode's own label.
- **Explore**: `VIEWS` has `explore` between home and stats; `#explore-screen` (not a `.view`: it does not scroll) with
  `#explore-stage.stage` > `#explore-globe.globe-host` + `#explore-credit`, `.explore-side` (`.explore-search` with
  `#explore-search` combobox, `#explore-search-clear`, `#explore-results` listbox; `#place-card.place`),
  `#explore-tools` (Colour by seg + `#explore-legend`), a `.mapctl` (data-action `explore-zoom` in|out|reset,
  `#explore-style-btn`), `#explore-status`.
- JS, section EXPLORE (after SATELLITE IMAGERY, before the engine): `EXPLORE_SKILLS`, `MASTERY_STEPS`, `explore`
  (state: on, selected, colour, view, home, countries, focus, results, active, flags), `worldNeighbours(geometries)`
  -> `state.neighbours` (set in `loadWorldFeatures`), `EXTRA_BORDERS`, `BORDER_ONLY`, `exploreCountries()`,
  `isCountryKey(key)`, `countryFromHash()`, `renderExplore()`, `enterExplore()` / `leaveExplore()` /
  `setExploreLayers()` / `frameExplore()`, `paintExplore()`, `drawExploreOverlay(ctx)`, `onExploreClick(e)`,
  `countryFocus(name)`, `exploreClear()`, `viewCentreFor(lonlat, radius, dx, dy)`, `showCountry(name, opts)`,
  `selectCountry(name, opts)`, `renderExploreTools()`, `chooseExploreColour()`, `daysAgoText(day)`, `renderPlace()`,
  `setPlaceHeight()` (`--place-h` on the screen), `searchCountries(text)`, `pickCountry(name, fromSearch)`.
- Map code generalised: `mapStage()` (the stage in use), `mapStyleButtons()`, `imageryFailedNotice()`,
  `satEnabled()` ignores Uncharted while `explore.on`; engine styles `step0`..`step3` (0.82 alpha over imagery);
  `drawMapOverlay`, `onMapClick`, `onMapMove`, the hover handler and `placeLearnLabels` branch on `explore.on`.
  `switchScreen` leaves Explore for any other screen and keeps the globe running on `explore`; `startGame` calls
  `leaveExplore()` right after its awaits. `init()` re-renders Explore once the globe exists.
- Keys: `globeKey(e)` + `turnGlobe(dx, dy)` (arrows, + - 0) shared by the game's key handler and Explore's.
- ACTIONS: `see-on-globe` (Stats footer chips), `explore-colour`, `explore-pick`, `explore-close`,
  `explore-search-clear`, `explore-zoom`, `explore-map-style`. Hook: `window.__atlas.explore`, `.selectCountry`,
  `.searchCountries`.
- CLAUDE.md: Explore paragraph, Learn paragraph rewritten, `&learn=1`.

### Traps and notes for successors
- Never call `frameMap()` / `applyMapStyle()` for a round while `explore.on` is true: they would measure and style
  Explore's stage. `startGame` handles it (`leaveExplore()` before `applyImagerySupport()`).
- `.explore-side` is a flex item with a z-index: it is a stacking context (search results must stay above the tools).
- The colour check in the suite reads the screen through `page.screenshot` + a canvas in the page (no PNG library here).
- A flight starts a frame or more after the key or click under software rendering: tests wait with `moved(page, from)`
  (the view left `from`, then came to rest), not with a fixed sleep.
- Test tools: `explore/check-explore.js [--mobile] [--only=nav,neighbours,select,search,colour,satellite,keys,
  roundtrip,links,stats,learn,nogl]`, `explore/shoot-explore.js [--mobile] [--dark] [--size=WxH] [--only=explore,
  search,colour,satellite,stats,link,sizes,learn,learnsheet]`, `explore/nb-raw.js` (topology neighbours, raw names),
  `explore/run-suites.sh` (every suite; writes explore/suites.log and explore/suites/*.log), `explore/run-rest.sh`
  (the suites the stopped run had not finished; writes explore/rest.log and explore/suites-rest/*.log).

### Final state of this stage
Every suite passes on the final tree (public/index.html sha1 a3744e01…, the file of fd779a9; HEAD 1330e48 adds only
wip/ snapshots). Two runs make up the record, both on that same file:
- Run of 17:19–17:58 UTC (`explore/suites.log`), suites not touched since: stats 168 desktop / 170 phone, settings
  93 / 93, globe 123 / 121, modes 163 / 170, smoke desktop 13.
- Run of 20:44–21:15 UTC (`explore/rest.log`): shell 246 desktop / 242 phone, game 110 desktop / 115 phone, edges 37,
  smoke phone 13, explore 192 / 192, logic: syntax ok, the five paste checks (mastery, globe, quiz, world facts, flag
  font), t1 38, t2 46, t3 40, t4 67, t5 4, t6 7, t7 (records function) passed, v-b4-learn 10.
Expectations that were out of date with an intended change, corrected in the suites (the app was not changed for
any of them, and no check was weakened):
- `shell/check-shell.js` (before: `check-shell.before-explore.js`): a new continent level's sheet offers Play and
  Learn (was Play only); Africa with a focus list offers Play, Focus Practice and Learn.
- `game/check-game.js` (phone HUD layout) and `globe-stage/check-edges.js`: `.mapctl` became ambiguous once Explore
  had its own map controls; both now read `#game-screen .mapctl`.
- `logic-tests/t3-links-b4-d6.js` (before: `t3-links-b4-d6.before-explore.js`): `?play=europe&learn=1` used to be the
  case of a level without Learn; it now opens Europe's ladder, so the test asserts that, and uses
  `?play=world&learn=1` for the level without one (a plain round of 184). It had timed out waiting for a question.
Screenshots (`$S/shots/app/explore/`, 120 files, desktop and phone, both themes; 113 taken by the first agent between
16:47 and 17:17 UTC, so the desktop light colour, satellite and search shots predate e97df55 and fd779a9; the seven
dark phone shots of search, the Stats link and the Japan link were missing and were taken at 21:13 UTC). The second
agent opened fifteen and changed nothing: Explore open (desktop light), France (desktop light: ten borders with
Brazil and Suriname, Andorra and Monaco named below the chips), Barbados (phone light: "No land borders."), Germany
(phone dark), colour by Capital (desktop dark and light, legend counts), satellite coloured with Egypt selected
(phone light, Esri credit showing), search results (phone light), the Stats chips (phone light), Learn study for
Europe (desktop dark) and Africa (phone light), Learn quiz for Europe (phone dark), and in dark on a phone the
alias search ("holl" finds Netherlands), Explore as the Stats link opens it, and `#explore=japan` for a new player.
One thing seen and left for the polish stage: on a phone the search list drops over the Colour by panel, and a
one-result list ends halfway down it, across the top of the segmented control. It is a list over the panel (the
panel is not broken and comes back when the list closes), but it looks untidy.
Neighbours: the suite's hand-checked table (24 countries with borders, 13 islands, and the full list of 28 with no
land border) was read through again by the second agent, from its own knowledge of the borders, not against a
printed atlas; no disagreement.

Not done / not verified:
- Real Esri imagery, the live site, Safari, Firefox and real touch devices: not reachable here. Satellite in
  Explore was only seen over the harness's stand-in tiles.
- The place card as a live region was checked by its attributes in the suite, not with a screen reader.
- Not every screenshot was opened by the second agent (15 of 120); the landscape-phone and 800x700 shots, the
  States ladder and most colour-by settings were not opened again.
- Stats, settings, globe, modes and desktop smoke were not re-run after 17:58 UTC; they passed on the same file.
- Learn study on a phone turns the globe to the newest name, so on a long ladder (Africa, level 22) earlier names
  can be off screen until the player drags; this is how the province ladders already behaved.
- `state.learn`'s comment in the state object still says "province ladder" (index.html, `learn: null`); it is
  the Learn run for any level with a ladder. Left for the polish stage rather than change the file after the run.
- atlas_handoff.md does not describe Explore or the wider Learn; CLAUDE.md does.

Orchestrator note, 2026-11-17 18:00 UTC: the pipeline was stopped at the owner's request (they need the rest of
this usage window) while the Explore stage was on its final suite run; tree clean at 245bb57, Explore's code is
fd779a9. What is left of the stage is in the resume note (`$S/resume-note-explore.txt`); a resume is scheduled
for 20:41 UTC with `atlas-learning-resume.js` (quiz and modes pinned, Explore to finish, then Polish).


## Stage: performance, accessibility, polish, housekeeping, docs

Status: FINISHED 2026-11-18 (commits 287b894, 23f7e36, 2e19ffc, c15645d, 10a55d8, 2848f09; all pushed; the app files are
those of c15645d). The finished record is at the end of this section; the notes between are the working log.
Working files: `$S/work/integration/polish/`. Screenshots: `$S/shots/app/polish/`.

### Plan (commit + push after each)
1. Orchestrator defects: phone continent frame (fit width), Night Chart land vs dim, start-to-first-question
   (prebuild the map on Home / sheet), landscape-phone prompt card, Pin after-drop centring.
2. Performance: measure old vs new (bytes, requests, first screen, start→question, frame cost, memory); fix.
3. Accessibility: focus rings, focus traps, live region, reduced motion, contrast.
4. Visual sweep at five sizes, both themes.
5. Housekeeping: dead code, vendor README, tools/tests/ (modules tested out of index.html).
6. Docs: CLAUDE.md, atlas_handoff.md.

### State at 22:25 UTC (commits 287b894, 23f7e36, both pushed; the full suite chain is running on 23f7e36)
DONE in the repo (each verified as noted):
- Performance: `listedOnce()` memo for `countryNames` / `quizNames` (Home's draw 230 ms -> 30 ms); capital-find `asks`
  no longer calls `Quiz.capitalPrompt`; `<link rel=preload>` for the 50m world; `initGlobe()` deferred until Home has
  painted (rAF + timeout; `startGame` and `renderExplore` make the globe themselves if it is not there yet);
  `startGame` sets `body[data-screen=game]` before `frameMap()` so the canvases are sized once, and the first prompt
  goes up in a 0 ms round timer (was 80 ms, with a second `frameMap`); `prepareLevelMap(level)` (from
  `openLevelSheet`) fetches a level's map and builds it (`syncMapLayers(country)`) unless Explore has the globe;
  US states are TopoJSON (`public/data/us-states.json`, object `states`; `state.usBorders`); the daily countdown
  ticks only for `.screen.active [data-countdown]` and `switchScreen` restarts it.
  Numbers (stock harness flags, fonts answered from memory, medians of 3-5): Home usable 516 -> 208 ms desktop,
  646 -> 240 ms phone (old app 200); Start -> first question Europe 172 -> 65 ms, States 304 -> 67, India 233 -> 93,
  Europe on satellite 302 -> 94 (old app: Europe 479, States 668); level link 832 -> 718 (old 600). Heap 11 MB on
  Home, 17.7 MB after ten rounds, 17.9 after twenty; listeners constant. Tools: `polish/perf.js`, `profile.js`,
  `timeline.js`, `sizes.js`, `cls.js`; raw numbers `polish/perf-results*.jsonl`.
- Frames: `TALL_FRAMES` (places that bound Europe, Africa, North America) + `balancedCentre()` for a stage taller
  than wide; short wide windows put the prompt card at the left (CSS block `(max-height: 520px) and (min-width: 600px)`,
  `stageClearArea` `cardAtSide`, `placeGlobeHost` shifts the host sideways too). Pin the City's opening frame was
  measured, not changed: its twenty cities sit inside the clear area (the card only covers land with no city).
- Tokens: `--g-dim` (both themes; dark land `#485a73` vs dim `#223c56`), `--focus-color`, `--control-border`,
  map marks re-toned so found / second / missed differ in lightness. `polish/contrast.js` measures every pair.
- A11y: results summary takes focus (`#results-summary` tabindex -1), Escape leaves results, transparent outline
  under the focus shadow, Explore search box ring.
- Explore phone: `.is-searching` hides the Colour by panel under the list; `.has-sheet` + `(max-height: 780px)`
  hides it while a country's sheet is open; sheet max-height 44%.
- Stats: `.recs` rows replace the records table below 900px. `.view { scrollbar-gutter: stable }`.
- Housekeeping: `tools/tests/` (extract.js, run.js, mastery/quiz/world-facts/globe tests, fixtures, globe harness
  + pages) — all pass from the repo (709, 180, 44, world facts OK, globe 291/291); `public/vendor/README.md`;
  unused tokens and classes removed; module banners reworded (the QUIZ banner line changed, so the scratch
  `check-quiz-paste.js` is retired: `logic-tests/run-all.sh` runs `tools/tests/run.js --quick` instead; the copy
  from before is `run-all.before-polish.sh`).
- Suite of this stage: `polish/check-polish.js` (groups contrast, perf, frames, a11y, explore), runner
  `polish/run-suites.sh [names]` (two lanes; `polish/suites.log`). Sweep: `polish/sweep.sh` + `shot.js --audit`.

Orchestrator note, 2026-11-17 22:49 UTC: with a usage limit close, the orchestrator committed the docs as they stood
(a commit titled "Checkpoint: CLAUDE.md and the handoff rewritten for the new app, in progress") and pushed. The
polish stage may amend the two files further in a commit of its own; check git log before assuming they are uncommitted.


### Finished record (2026-11-18, about 02:45 UTC)

The stage was closed in a third session that built nothing new. It re-ran what the second session's final run had
not finished, found three suite checks out of date with intended changes (below), measured the final tree again,
and corrected the speed table in atlas_handoff.md (commits 10a55d8 and 2848f09; nothing else in the repo changed
after c15645d). HEAD is 2848f09, equal to origin, tree clean.
The dated seeds were regenerated first (the UTC day had changed): `harness/seed-rich.js` four times (default,
`--unplayed --out=…/seed-rich-unplayed.json`, `--quiz`, `--heavy`) and `shell/gen-seed.js`.

**Suites on the final tree** (app files of c15645d; run on 17 Nov 22:56-23:12 UTC unless marked 18 Nov):
| suite | desktop | phone |
| polish/check-polish.js | 112 | (one size) |
| explore/check-explore.js | 192 | 192 |
| shell/check-shell.js | 246 | 242 |
| pages/check-stats.js | 168 | 170 |
| pages/check-settings.js | 93 | 93 |
| game/check-game.js | 110 | 115 |
| globe-stage/check-globe.js | 123 (18 Nov, after the two check fixes) | 121 |
| modes/check-modes.js | 163 (18 Nov) | 170 |
| harness/smoke.js | 13/13 (18 Nov) | 13/13 (18 Nov) |
| globe-stage/check-edges.js | 37 (18 Nov) | |
| logic-tests/run-all.sh (18 Nov, 02:38, "logic suites failed: 0") | syntax ok; tools/tests/run.js --quick: world facts, quiz 44, mastery 709, mastery across zones 180; t1 38, t2 46, t3 41, t4 67, t5 4, t6 7 | |
| logic-tests/v-b4-learn.js, t7-records-function.mjs (18 Nov) | 10; all passed | |
`node tools/tests/run.js --globe` was last run on 17 Nov 22:03 (291/291); the engine section is byte for byte the same
in 1330e48 and c15645d, so it was not run again.

**Checks brought up to date in this session (the app was right in all three; no check was weakened):**
- check-globe.js "the cursor is a hand over a place that can be picked": it always hovered over Chad, but when the
  round's first question was Chad the two wrong taps before it reveal and mark Chad, and a marked place cannot be
  picked. It failed whenever the first question was Chad (one start in three). It now hovers over whichever of Chad, Mali and Niger carries no mark and waits
  for the cursor instead of a fixed 200 ms. (Copy from before: `check-globe.before-close.js`.)
- check-globe.js "imagery (normal, russia-west, learn): tiles arrive and the note stops saying Loading": a round now
  starts while the last round's imagery still reads `ready`; the Learn study panel then turns the globe and asks for
  more tiles, and the note rightly says Loading for about a second. `imagerySettled()` waits for `ready` with the
  globe at rest (it replaced `imageryReady()`).
- logic-tests/t3-links-b4-d6.js "a round left before its first prompt asks nothing": it left the round during the
  80 ms start delay, which this stage removed (the prompt goes up in a 0 ms round timer). It now leaves from a
  mutation observer on `body[data-screen]`, which runs before that timer, and asserts first that no prompt was up
  when it left. (Copy from before: `t3-links-b4-d6.before-polish.js`.)
- logic-tests/run-all.sh now exits with the number of suites that failed and prints "logic suites failed: N" last;
  before, a failed t-suite left the runner's exit status at 0 and its line in `polish/suites.log` looked green.
  (The t3 failure above had been hidden that way.)

**Measurements, final tree** (`polish/perf.js`, tags `final` and `final2` in `polish/perf-results.jsonl`; stock
harness flags, GPU compositing on the software GL driver; local server; fonts answered from memory; medians):
| | old app (1c74e1d) | before this stage (1330e48) | final |
| cold load of Home: requests | 9 | 10 | 10 |
| cold load of Home: bytes raw / as brotli | 1,518 KB / 494 KB | 1,685 KB / 508 KB | 1,694 KB / 510 KB |
| Home usable, desktop | 200 ms | 516 ms | 210 ms |
| Home usable, phone | not run | 646 ms | 218 ms |
| Start -> first question, Europe, desktop / phone | 479 ms / not run | 172 / 179 ms | 59 / 64 ms (8 runs each) |
| Start -> first question, States | 668 ms / not run | 304 / 330 ms | 76 / 62 ms |
| Start -> first question, India | (chooser) | 233 / 306 ms | 100 / 80 ms |
| Start -> first question, Europe on satellite | old app's run timed out | 187-363 / 345-363 ms | 77-91 or 261-271 / 90-95 or 230-298 ms |
| level link, cold -> first question | 600 ms | 832 / 1479 ms | 660 / 684 ms |
| JS heap: Home / after 10 rounds / after 20 | not run | 11.1 / 15.8 / 15.9 MB | 11.0 / 17.8 / 17.9 MB |
| listeners on Home and after 20 rounds | not run | 63 / 63 | 64 / 64 |
| US states file raw / brotli | 1,037 KB / 185 KB | same | 445 KB / 132 KB |
Satellite start is bimodal on this machine (about half the runs in each group, 16 runs): `polish/dbg/satstart.js`
and `satstart2.js` show one task of 65-77 ms (the game's own work), the game screen up at 64-76 ms, and the first
prompt either about 15 ms later or (one probe run of 14, half of the perf.js runs) about 170 ms later. The slow
probe run reported no long task in that gap. In the fast probe runs the animation frames after the prompt take
90-215 ms each with blockingDuration 0 and no script, so frames here spend their time waiting on the software GL
driver; the likeliest reading is that the 0 ms prompt timer sometimes falls behind such a wait. That is an
inference, not a trace. What a real GPU does with it cannot be measured here.
Per frame while turning and zooming the 50m world (`globe-stage/measure.js --apps=new --stock-gpu --runs=2`, output in
`polish/measure-final.log`): engine draw call median 0.2-0.3 ms (p95 0.3-2.7); script 0.5-0.9 ms per frame; all
main-thread work 2.9-3.1 ms per frame; the same within noise on chart and satellite, desktop and phone. Frame
intervals here are 180-300 ms (software GL; not what a GPU does). The old app's per-frame figures are the globe
stage's (M5): script 0.2-0.4 ms, main thread 3-20 ms, plus 47-51 ms of reprojection after each satellite gesture.

**Seen again on the final tree in this session** (`shots/app/polish/fin-*.png`, 7 opened): Europe and Africa on a
dark phone (the continent fills the width; the round's land stands clear of the land around it), Europe on a phone
held sideways (card at the left, Europe clear of it), Pin the City Europe opening and after a drop at desktop light
and phone dark (pin, city and the line between them clear of the card), results in Night Chart.

**Not done or not verifiable here:**
- Real Esri imagery, the live site, Safari, Firefox, real touch devices, a real GPU (frame rates), a screen reader.
- The five-size sweep's 328 screenshots were taken at 21:59-22:13 on 17 Nov, before 23f7e36 (focus ring, control
  edges, mark colours) and c15645d; how many of them the earlier sessions opened is not recorded. This session
  opened only the seven above.
- The old app was not measured at phone size by perf.js, and its satellite start timed out under the stock flags.
- The page links favicon-32.png, favicon.png, favicon-180.png and og-image.png; none of them is tracked in git
  (not on main either). Left alone, as the owner rules say; whether the live site serves them could not be checked.
- Still open from earlier stages and left as they were: Learn study on a phone turns to the newest name, so on a
  long ladder earlier names can be off screen until the player drags; Afghanistan's flag; strict typo margins in
  Name It; no typed-capitals mode; iOS keyboard behaviour in Name It untested.

