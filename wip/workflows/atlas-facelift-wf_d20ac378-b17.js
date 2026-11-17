export const meta = {
  name: 'atlas-facelift',
  description: 'Logic layer (mastery, level registry), then the facelift of every screen in public/index.html, then review and fixes',
  phases: [
    { title: 'Logic', detail: 'mastery module, LEVELS registry, recording, sync, test hook; smoke suite in parallel' },
    { title: 'Shell', detail: 'design system, themes, app shell, Home, level sheet' },
    { title: 'Pages', detail: 'Stats and Settings' },
    { title: 'Game', detail: 'game HUD and results screen' },
    { title: 'Globe', detail: 'the WebGL globe replaces the flat map in every mode' },
    { title: 'Review', detail: 'three independent reviewers' },
    { title: 'Fix', detail: 'reproduce and fix confirmed findings' },
  ],
}

const S = '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad'
const REPO = '/home/user/atlas-game'

const COMMON = `
You are one stage of a multi-stage overhaul of a geography quiz web app. Read ${S}/BRIEF.md and then
${S}/work/integration/PLAN.md in full before anything else — PLAN.md is the target and names the reference
files. The app is ONE file, ${REPO}/public/index.html (about 8,200 lines: CSS, markup, one IIFE script).
Stages run one after another on that file, so grep for the current state before you edit; an inventory's
line numbers may be stale. Other agents are NOT editing the repo while you work.

Working rules:
- Extend the existing file; do not rebuild from scratch and do not add files to the repo other than the
  ones your stage names. Match the code style in CLAUDE.md (semicolons, 2-space indent, // comments,
  /* ===== Section ===== */ dividers, a one-line comment above non-obvious functions, CSS custom properties
  for colour). Comments describe what the code does or why, never the history of the change.
- Delete code and CSS your work makes dead. Do not leave old and new versions side by side.
- Verify as you go: extract the script block(s) and run node --check; drive the app through
  ${S}/harness/atlas-harness.js (see BRIEF.md) and LOOK at screenshots of what you built with the Read tool
  (desktop 1280x800 and phone 390x844; light and dark once themes exist). A visual feature is not done until
  you have looked at it. Fix what you see.
- If ${S}/harness/smoke.js exists, run it before finishing (NODE_PATH=/opt/node-tools/node_modules node
  ${S}/harness/smoke.js) and fix real failures in the app. If a failure is the suite being out of date with
  an intended change, update the suite's adapter or expectation and say so in your report — never weaken a
  check to hide a bug.
- When your stage passes its checks, commit it in the repo as PLAN.md section 6 describes (do not push).
- Be honest in your report: what is done, what you verified and how, what is not done or not verified.
- INTERRUPTIONS: this work can be cut off at any moment by a usage limit, and a fresh agent with no memory is
  then given this same brief. So FIRST read ${S}/work/integration/progress.md if it exists, and look at
  git log, git status and git diff: if an earlier attempt at YOUR stage left work behind, continue from it
  instead of starting over (check its claims rather than trusting them). As you work, keep progress.md
  current: a section for your stage listing what is done and verified, what is in progress, what remains,
  and anything a successor must know. Keep public/index.html in a working, syntax-valid state at every save
  point, and commit each coherent piece as you finish it (several commits per stage are fine).
`

const STAGE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'What was built and how it was verified' },
    commit: { type: 'string', description: 'Commit hash of this stage, or empty if not committed' },
    checks: { type: 'string', description: 'Checks run and their results (syntax, smoke, screenshots looked at)' },
    notDone: { type: 'array', items: { type: 'string' }, description: 'Anything from the stage brief that is not done or not verified' },
    notesForNextStage: { type: 'array', items: { type: 'string' }, description: 'Names of new functions/classes/ids/hooks the next stages must know, and any traps' },
  },
  required: ['summary', 'commit', 'checks', 'notDone', 'notesForNextStage'],
}

function notes(prev) {
  const out = []
  prev.filter(Boolean).forEach(p => {
    out.push(`--- ${p.stage} (commit ${p.commit || 'none'}) ---`)
    out.push(p.summary)
    if (p.notDone && p.notDone.length) out.push('Not done / not verified: ' + p.notDone.join(' | '))
    if (p.notesForNextStage && p.notesForNextStage.length) out.push('Notes: ' + p.notesForNextStage.join(' | '))
  })
  return out.length ? '\nReports from the stages before yours:\n' + out.join('\n') + '\n' : ''
}

// ---------- Logic ----------
phase('Logic')

const smokePrompt = `
Read ${S}/BRIEF.md, then ${S}/work/integration/PLAN.md (sections 2, 4, 5, 6), then skim
${S}/maps/ui-inventory.md sections 5 and 6 and ${S}/maps/map-port-checklist.md section 3 for how each mode
plays. Do NOT edit anything under ${REPO}; another agent is editing ${REPO}/public/index.html right now.

Write an end-to-end smoke suite, ${S}/harness/smoke.js, for the app in ${REPO}/public, using
${S}/harness/atlas-harness.js. It will be run by every later stage of a large refactor (new menus, then the
SVG map replaced by a WebGL globe), so build it to survive those changes:
- Start levels through deep links (${'`'}?play=<slug>${'`'}, ${'`'}&learn=1${'`'}), never through menu clicks.
- Read game state through the test hook ${'`'}window.__atlas${'`'} (PLAN.md section 6: { state, mastery, LEVELS,
  startGame, version }). The hook is being added right now by the other agent; until it lands, test against
  a COPY of public/ (launch({ root })) in which you append the hook line yourself just before the IIFE's
  final init() call. Guard for a missing hook with a clear failure message.
- Put everything that touches the map in ONE clearly marked adapter section at the top of the file
  (answer(page, name): click the item currently asked for or a named item; answerWrong(page): click an item
  that is not the answer; pinAt(page, lon, lat) for Pin the City; plus whatever else you need). Today the
  adapter drives the SVG map (find the element bound to the item and dispatch a real click at its position;
  city modes use dots). When the globe lands, only this section is rewritten. Keep the rest map-agnostic:
  detect screens by ${'`'}#game-screen.active${'`'} / ${'`'}#results-screen.active${'`'} / ${'`'}#menu-screen.active${'`'}, use the keyboard
  for Skip and other shortcuts, and read numbers from the hook's state rather than from HUD text.
- Cover, each as its own named check with PASS/FAIL output and a non-zero exit code on any failure:
  1. boot: page loads with no page errors or console errors, menu renders, time to interactive printed;
  2. a full continent round answered perfectly (pick a small one) reaches the results screen, writes the
     expected atlas-records key, and a clean-sweep time is stored;
  3. a round with deliberate wrong taps and skips: second-try and miss outcomes are counted, the focus list
     is written, and a focus practice round over that list plays and leaves atlas-records unchanged;
  4. The World starts and asks questions (play 5, then leave by the back control; no errors);
  5. US States, States → Capitals, Capitals → States, one US Cities region: play at least 5 questions each
     through whatever input that mode uses, including one wrong answer;
  6. a province level played in full (Canada), and Learn mode (?play=<province slug>&learn=1) through its
     first two ladder levels including one deliberate miss that restarts a level;
  7. Pin the City: a full 20-pin round with a mix of accurate and far pins; atlas-pin gains a game;
  8. Daily Five: play it, confirm the attempt is stored and that reloading shows the played state and does
     not allow a second scored attempt;
  9. Hard and Uncharted difficulty each start a round and answer 3 questions; satellite map style starts a
     round with mock tiles requested (netLog.tiles > 0) and, with tiles: 'fail', the game still plays;
  10. persistence: a returning player's stores survive — seed localStorage with a realistic OLD store
      (records for several levels and difficulties, a focus list, daily attempts, pin history; shapes in
      ${S}/maps/ui-inventory.md section 4) and check the app reads it without rewriting or dropping keys;
  11. mastery (skip with a clear SKIP line if window.__atlas.mastery is absent): outcomes from checks 2-3
      appear in atlas-mastery under the skills in PLAN.md section 4, Learn quizzes do not add items, and a
      finished round adds a session to today;
  12. stale-timer guard: leave a round during an answer reveal and start another at once; the new round's
      first question must not be skipped (map-port-checklist bug B4 — this may FAIL today; report it, keep
      the check);
  13. invalid deep links (?play=nonsense, ?play=midwest-cities if that is not a real slug) land on the menu
      and write nothing (ui-inventory D7 — may FAIL today; keep the check).
- Options: ${'`'}--only=<name,name>${'`'} to run a subset, ${'`'}--root=<dir>${'`'}, ${'`'}--shots=<dir>${'`'} to save a screenshot at
  the end of each check, ${'`'}--mobile${'`'} to run at phone size with touch. Whole suite under about 4 minutes.
- Run it against the current app (through your patched copy if the hook has not landed) and make every check
  either PASS or FAIL for a reason that is a real app bug you can name. Speed up waits by polling state, not
  fixed sleeps, but do not bypass the app's own reveal delays by reaching into internals.

INTERRUPTIONS: this work can be cut off at any moment by a usage limit, and a fresh agent with no memory is
then given this same brief. So first check whether ${S}/harness/smoke.js and ${S}/harness/smoke-progress.md
already exist and continue from them; keep smoke-progress.md current (checks written, checks verified, what
remains) and keep smoke.js runnable at every save.

Return: the path, how to run it, the result of your final run (per check), every app bug it exposed with
evidence, and anything about the hook or DOM the app stages must keep stable for the suite to work.
`

const logicPrompt = COMMON + `
YOUR STAGE: the logic layer. No visual redesign in this stage — the screens keep their current look.

1. Level registry. Add the LEVELS registry described in PLAN.md section 2 as the single list of playable
   levels (every level the menus reach today: The World, six continents, the three US state/capital modes,
   the US Cities regions, every province round, every Pin the City round; the Daily Five is not a library
   level). Each entry: key (the ?play= slug — every slug linkSlugs() produces today must be preserved),
   collection, title, arg (what startGame() takes), mode, skill (PLAN.md section 4), noun, names() returning
   the exact item-name strings the game uses for that level (lazy: world/US/province data loads at different
   times; names() may return [] until its data is loaded — say so in a comment and expose a way to know).
   Add helpers (levelByKey, levelForStartArg, the skill of the round in play) and rebuild linkSlugs() /
   slugForStartArg() on top of the registry. The existing menus keep working unchanged for now.
2. Mastery. Paste ${S}/work/mastery/mastery.js into the script as its own section and wire it exactly as
   PLAN.md section 4 says: outcomes at every question resolution with the skills table, the Pin the City
   mapping, no item recording in Learn quizzes, recordSession once per finished round, reload() on the
   storage event. Check name uniqueness inside each skill (US cities, pin cities) and disambiguate where two
   items share a name. Paste it as one contiguous block between its own banner comment and a closing
   marker comment. Before pasting, run its two test files in ${S}/work/mastery/ (node test-mastery.js, which
   should print 709 passed; and node review-test.js, written by a reviewer who was cut off after fixing a
   lifetime-tally merge defect: its one known failure is a time-zone NAME mismatch in the test itself,
   'Asia/Katmandu' vs 'Asia/Kathmandu' - fix that in the test, not the module). If anything else fails,
   fix the module in ${S}/work/mastery/mastery.js with a regression check, then paste the fixed file. Never
   let the pasted copy and that file differ.
3. Sync. Add mastery (and resetAt) to the sync payload and the merge on pull, as PLAN.md section 4 says. Raise
   MAX_BODY_BYTES in ${REPO}/functions/api/records.js to 256 KB and make the comment there true. Make a 413
   (and other push failures) visible through whatever sync status the app already shows. Fix the sync merge
   gaps listed as D14 in ${S}/maps/ui-inventory.md where the fix is clear and safe.
4. Reset plumbing (no UI yet): one function that erases all progress stores (records, focus, pin, learn,
   daily attempts, mastery), stamps atlas-reset-at and pushes, plus the pull-side rule in PLAN.md section 4.
   Also an exportProgress() that returns one JSON-serialisable object of every store (for a later Download).
5. Bugs in game logic (read the entries in ${S}/maps/map-port-checklist.md section 0 and
   ${S}/maps/ui-inventory.md section 0 before fixing):
   - B1 / D5: Australia is unplayable because featureKey() collides on a shared id. Key features by name
     where ids are missing or duplicated, and confirm Australia is asked for in Oceania and The World.
   - B4: stale delayed callbacks from an abandoned round act on the next round. Add a per-round id guard to
     every delayed callback the checklist lists.
   - D7: ?play= with a slug that is not a real level opens an empty game and writes records. Apply the
     deep-link rules in PLAN.md section 2 ("Deep links"), including "?play=<slug> starts a fresh full round".
   - D3: the capitals cards never show a best because the menu reads records under a different key than the
     game writes. Fix the read side (never change what is written).
   - D6: the load-failure message targets an element that does not exist.
6. Test hook: window.__atlas as in PLAN.md section 6.

Verify: node --check; play at least a continent round, a US round, a province round, Learn, Pin the City and
the Daily Five through the harness and inspect localStorage['atlas-mastery'] afterwards; confirm an old
seeded store (shapes in ui-inventory section 4) is read unchanged; confirm sync payload size and merge with
a simulated remote blob (the harness answers /api/records with null — stub fetch in the page for a
round-trip test). A smoke suite is being written in parallel at ${S}/harness/smoke.js; if it exists when you
are done, run it and act on real failures.
`

// Finished stage, recorded as returned so a restart never runs it again.
const logic = {
  "summary": "An earlier attempt at this stage had already committed the whole logic layer as c2f1b63. I checked its claims instead of redoing it: they hold, with one defect that I fixed and one small registry addition.\n\n**In the app now (public/index.html, functions/api/records.js)**\n- **Levels:** `LEVELS` holds 27 levels in 4 `COLLECTIONS`, with `levelByKey`, `levelForStartArg` and `roundSkill`. `linkSlugs()` and `slugForStartArg()` are rebuilt on it and all 28 old slugs are kept. The old menus are untouched.\n- **Mastery:** `mastery.js` is pasted byte-identical between its banner and `/* ===== END OF MASTERY MODULE ===== */`. Every resolved question records through `scoreAnswer(points)`; Pin the City maps points through `pinOutcome`. Learn quizzes record no items. Each finished round and each cleared Learn level is one session. The `storage` event calls `reload()`. `claimName` disambiguates US city and pin city names; today's data has no clash.\n- **Sync:** the payload is a snapshot of every progress store plus mastery, Learn ladders and `resetAt`. The server limit is 256 KB counted in bytes, and a heavy player's payload measured 106 KB. A failed push or pull (413 included) turns the menu's sync button to its error state at once and is explained in words in the sync panel.\n- **Reset and export:** `resetProgress()` erases all six stores, stamps `atlas-reset-at` and pushes; the pull side follows the plan's rule. `exportProgress()` returns every store as one object.\n- **Bugs:** B1/D5 (Australia is asked in Oceania, now 7, and The World, now 184), B4 (`state.roundId` and `roundTimeout()` on all 12 listed timers plus the start delay), D7, D3 and D6 are fixed.\n- **Test hook:** `window.__atlas` is exposed, version 2.\n\n**What I changed**\n- **4ee090c:** a synced `resetAt` of `Infinity` (JSON `1e999`) counted as a newer reset. It cannot be read back from localStorage, so the device would have wiped its progress on every pull. Non-finite values now count as no reset. The new check fails on c2f1b63 and passes now.\n- **381db13:** added `level.count()`. `names()` is empty for a province level until its map loads, so a level card built from the registry would have read 0 for all six province rounds.\n\nThe two mastery test files pass without touching the module; the only test change is the time-zone name comparison in review-test.js, which still confirms the zone is in force. I also probed stale timers after an abandoned Learn miss and an abandoned city skip with real timers (clean), and confirmed feature names are present and unique in all ten map files. Nothing was pushed.",
  "commit": "381db13",
  "checks": "All run on the final file unless noted.\n- **Syntax:** `node --check` on the one inline script block passes (6,738 lines).\n- **Mastery module:** `test-mastery.js` 709 passed, 0 failed; `review-test.js` 180 passed across 5 time zones. The pasted copy is byte-identical to `work/mastery/mastery.js` (29,874 chars).\n- **Logic suites** (`$S/work/integration/logic-tests/run-all.sh`), all exit 0:\n  - registry and world: 37\n  - modes: 47 (States, both capitals modes, Northeast cities, Canada, Learn, Pin, Daily Five and its replay, with `atlas-mastery` inspected afterwards)\n  - links, B4, D6: 39\n  - stores, sync, reset: 69 (seeded old stores byte-identical after load; payload and merge against a simulated server; 413 and offline; reset and both pull-side cases; the new Infinity check)\n  - payload size: 4 (106 KB of 256 KB)\n  - duplicate names: 7\n- **Pages Function:** `t7-records-function.mjs`, called directly with a stand-in KV, passes: 256 KB exactly is stored, one byte over returns 413, the limit counts bytes.\n- **My probes:** `v-b4-learn.js` 10 passed with real timers; `v-names.js` found no missing or duplicate feature names in ten map files.\n- **Smoke suite** (`$S/harness/smoke.js`): 13 of 13 on desktop 1280x800 and 13 of 13 with `--mobile`, using real clicks and taps. No suite expectation was changed.\n- **Regression proof:** the Infinity check was run against c2f1b63 via git stash and failed there (`got [0,\"Infinity\"]`).\n- **Screenshots looked at** in `$S/shots/app/logic-verify/`, desktop and phone: menu, US cards with all three bests (D3), both notices, Oceania results, the sync error panel and the red dot on the menu button, pin reveal, Learn study and restart. The load-failure message was viewed in the earlier attempt's capture. The screens look as before. The `smoke-d` and `smoke-m` folders there are mid-fade captures from the suite, not a defect.\n- **`atlas-mastery` after my own play-through:** 7 Oceania countries with the outcomes played, 2 pin cities from an abandoned round, one session, and nothing from the abandoned Learn quiz.",
  "notDone": [
    "D14 `gamesPlayed` still merges with `Math.max`, so rounds played on two devices between syncs are under-counted. A correct fix needs per-device deltas and a pull before every push; a wrong one inflates counts permanently. `mastery.totals().games` is the dependable round count.",
    "Difficulty and map style are still per-device and not synced. That is deliberate; they are preferences, not progress.",
    "CLAUDE.md and atlas_handoff.md were not updated. CLAUDE.md is now wrong on: the 64 KB body limit (256 KB), Learn progress being cleared when a ladder finishes (a `{ done: true }` marker is left), practice and Learn not pushing to sync (they do), the `linkSlugs()` description, `?play=` opening a level the way a card tap does (it starts a fresh round), and `atlas-hard-mode` still being written.",
    "Not exercised: real Cloudflare KV, the live site, real Esri tiles. The Pages Function was only called directly with a stand-in KV.",
    "No dark-theme screenshots, because themes do not exist yet.",
    "The pull-side reset rule is implemented as the plan states it. Progress earned on a device after another device's reset, but before that device next pulls, is erased with the rest."
  ],
  "notesForNextStage": [
    "Registry: `LEVELS` (27 entries), `COLLECTIONS`, `levelByKey(key)`, `levelForStartArg(arg)`, `roundSkill()`. Each level has key, collection, title, arg, mode, skill, noun, available, `names()`, `ready()`, `load()`, `count()`.",
    "`names()` is `[]` for province levels until `await level.load()`, and for country levels until the world map is in. `count()` is correct for province levels straight away; use it for card counts and totals.",
    "Three levels have `available: false` (midwest-cities, south-cities, west-cities). Show them as coming soon; `startGame` refuses them with a notice.",
    "Records and focus lists are keyed by `resolveGameTarget(level.arg).region` plus mode, never by title. Pin the City bests come from `pinRegionStats(PIN_ROUNDS[key], difficulty)` in `atlas-pin`, not from `atlas-records`.",
    "Mastery: `const mastery = Mastery.create()`. Skills are country, us-state, us-capital, us-city, province:<country>, city-pin. Answers go through `scoreAnswer(points)`; pin uses `pinOutcome(pts)`. Keep the pasted module byte-identical to `$S/work/mastery/mastery.js`; `logic-tests/check-mastery-paste.js` checks it.",
    "Any new delayed callback during play must use `roundTimeout(fn, ms)`, not `setTimeout`. `state.roundId` goes up in `startGame` and on return to the menu.",
    "`featureKey(f)` is now `'name:' + raw feature name`, for example `name:United States of America`. It is not the canonical name and not an id.",
    "Progress API: `progressSnapshot()`, `exportProgress()`, `eraseProgress()`, `resetProgress()` (redraws the menu and returns the push promise), `loadResetAt()`. Sync: `syncErrorText(reason)`, `syncEntryState()`, `syncRefreshEntry()`; payload version 2.",
    "`showNotice(text)` / `hideNotice()` (`#app-notice`, `.app-notice`) is the only toast outside the game screen. It takes plain text and is hidden on leaving the menu.",
    "A finished Learn ladder leaves `{ done: true, savedAt }` under its round key in `atlas-learn`. List ladders in progress through `getLearnProgress(roundKey)`, which returns null for the marker; do not read raw keys.",
    "`startGame(arg, { practice: names })` works for every mode except the Daily Five. A Pin the City practice round would be saved as a full game in `atlas-pin`, so Smart Review must skip city-pin as the plan says.",
    "`window.__atlas = { state, mastery, LEVELS, COLLECTIONS, startGame, levelByKey, exportProgress, resetProgress, version: 2 }`.",
    "Australia re-enters the Daily Five's easy pool, so the daily sequence changes from the deploy day on. Replays of past dates also differ from what was originally played.",
    "Test traps: the harness's `seedStorage` refills missing keys on every load, which undoes a reset on reload. At small windows the top of the menu is out of a real click's reach (defect D1), so use DOM clicks. `logic-tests/lib.js` has `noPaint` and `fast` options because painting the 50m SVG in software takes seconds per frame.",
    "Checks for this stage live in `$S/work/integration/logic-tests/`; `./run-all.sh` runs them, and `t7-records-function.mjs` runs with plain node."
  ]
}
if (!logic) throw new Error('logic stage returned nothing')
const done = [Object.assign({ stage: 'Logic layer' }, logic)]
const smokeNote = `
The smoke suite is at ${S}/harness/smoke.js (13 checks). Its author was cut off before finishing, but the
logic-layer engineer reconciled it with the app: 13 of 13 pass on desktop and with --mobile against commit
c2f1b63. ${S}/harness/smoke-progress.md has the author's notes (how to run it, the browser flags it needs, how
its map adapter clicks places). The author never proved that each check can fail; if you have reason to doubt a
check, test it against a deliberately broken copy rather than trusting it.
`

// Guidance added for the stages after the logic layer.
const COMMON2 = COMMON + `
- PUSH (this replaces "do not push" in PLAN.md section 6): after each commit, push it so an interruption
  cannot lose it: git push -u origin claude/determined-hamilton-w2lcbm (on a network error retry up to 4
  times, waiting 2, 4, 8, 16 seconds). That branch only. Never force-push, never open a pull request.
- ECONOMY: the usage allowance for this work is tight. Spend it on building and checking, not on re-reading:
  read PLAN.md and the parts of the inventories your stage needs once; work on index.html with Grep and
  ranged Reads instead of reading the whole file again and again; send long command output to a file and
  grep it; look at the screenshots that matter rather than every one.
`
log('Logic layer: ' + (logic.commit || 'no commit'))

// ---------- Shell ----------
phase('Shell')
const shellPrompt = COMMON2 + notes(done) + smokeNote + `
YOUR STAGE: the design system, the app shell, Home and the level sheet.

Before anything else: run the smoke suite once to confirm your starting point (13 of 13 expected).

Then build, following PLAN.md sections 1, 2 and 3 and lifting from ${S}/work/design/a/src/styles.css,
body.html and icons.html (look at ${S}/shots/design/a/home-*.png and sheet-*.png first):
1. Tokens and themes: A's semantic token layer on top of the brand palette, light and dark, data-theme with
   the no-flash head script, theme-color meta, the font stack (Cormorant Garamond + Inter), base type and
   element styles, reduced-motion handling. Remove the old page-level look (textures, old header styles) as
   you replace it; keep the game and results screens working and legible in both themes even though their
   redesign is a later stage (map colours through tokens so the SVG map has a dark variant).
2. Components used across screens: buttons, icon buttons, segmented control, switch, chips, tags, rings,
   mastery bars, the icon sprite (inline SVG symbols; no icon font, no external requests), panels.
3. App shell: top nav on desktop, brand bar + bottom tab bar on phones, built from a small VIEWS registry;
   view switching with the hash rules in PLAN.md; the activity-streak chip and theme toggle. Create
   #stats-screen and #settings-screen as real, navigable views with a heading and a short "coming together"
   placeholder — the next stage fills them; keep the existing sync entry reachable from Settings so sync is
   never unreachable between stages.
4. Home: masthead with real figures, Today (Daily Five card with every state the current daily card has;
   Smart Review card including the playlist logic in PLAN.md section 4 and its empty state), the Library
   (difficulty and map controls, collection chips that scroll to their collection, collection headers with
   mastery, every level card from LEVELS). The old menu tree and its render functions go away; fix D1, D2,
   D4, D9, D10, D11, D12 on the way (ui-inventory section 0). Level cards must fill in correctly as lazy
   data arrives (counts and mastery for US and province levels come from data that loads later — find out
   what is known before load and never show a wrong count; preload or bake counts if needed).
5. Level sheet: as PLAN.md describes, replacing the focus chooser (inventory section 1.5) with every option
   that chooser offers today plus the difficulty-with-bests picker and map control. Keyboard and focus
   handling as described. Starting from the sheet goes through the same code path the chooser used.
6. First-run experience: a brand-new player sees a clean Home (no fake numbers), and nothing breaks when
   every store is empty. A returning player (seed an old store) sees their bests on the cards.

Screenshots to take and look at (save under ${S}/shots/app/shell/): home at desktop and phone in both themes
(top, and scrolled through the library), level sheet at both sizes in both themes (a level with a focus list
and bests, a province level with Learn, a new level), new-player home, returning-player home, the game and
results screens in both themes (to confirm they still work). Compare against ${S}/shots/design/a/ and close
the gaps you see.
`
// Finished results handed in by the orchestrator, so a restart never runs a finished stage again.
// The Stats and Settings stage finished in run wf_9922d84a-76c; its result is copied here from that run's journal.
const PAGES_DONE = {
  "summary": "Both parts are done and pushed: the previous stage is closed out, and Stats and Settings are real pages with the sync flow moved into Settings and an in-app dialog replacing every native one.\n\n**Close-out of the shell/Home stage (e7ed088)**\n- Smoke passed 13/13 on desktop and with --mobile; the interaction checks passed on both sizes after three expectations in the suite were corrected (see checks).\n- Home is not drawn twice at phone width. The DOM has one masthead, one library and 27 cards, and the view scrolls to its real end. The doubled image came from the capture: a window grown past about 8,000 device pixels repeats itself.\n- Fixed two things the checks and screenshots turned up: the four map controls still had `title=` tooltips, and phone level cards cut the best off with an ellipsis (\"Best 1,5\u2026\").\n- A new player, an old-store player, and the game and results screens in both themes were looked at. The odd phone map for Europe (whole world, offset) is the old map's behaviour; the baseline screenshot shows the same.\n- A sweep for dead code after the menu removal found none.\n\n**Stats (889d356)**\n- Every panel in the plan draws from the stores: headline figures, mastery by collection and level, a 12-week calendar with weekly totals, Needs work with a working \"Practice these\", Daily Five, Pin the City, and personal records (table on desktop, rows on phones).\n- Every value is printed; there is no hover layer and no `title=`. Each panel has a real empty state.\n- Record titles come from LEVELS, looked up by the stored keys; an old-store seed lists all of its records.\n- It redraws when shown, after a sync pull, and when another tab changes mastery.\n\n**Settings, dialog, sync (4cbf4a8, 231dffc)**\n- Theme tiles, Reduce motion (follows the OS until set), default difficulty and map style.\n- Sync is a card in Settings covering the whole flow, with its steps in the dialog. A 413 is explained in the card and on the navigation light.\n- Data: export downloads a JSON file without the sync code; reset sits behind a dialog listing what is erased. The reset reached a second device through a simulated sync round-trip, and that device's old copy did not come back to the server.\n- About carries the credits and a share action.\n- The old sync modal is deleted, and no `alert`, `confirm` or `prompt` is left. The toast, notice, loading card, map hints and record banner took the new shapes.\n\n`harness/seed-rich.js` is in place for later stages. It plays ten weeks through the real mastery module under a fake clock, using level names read from the running app.\n\nOne thing you might trip over: the dataviz validator flags the empty step of the mastery and heat ramps (the track colour) as low-contrast and off-hue. I kept the tokens as the design fixes them; every count is printed, so nothing depends on telling track from surface.",
  "commit": "231dffc",
  "checks": "**On the final file (231dffc)**\n- Syntax check on both script blocks and the mastery paste check pass.\n- `smoke.js`: 13/13 desktop, 13/13 --mobile.\n- `pages/check-settings.js`: 93 assertions desktop, 93 --mobile. Covers theme, motion, difficulty and map; create, show, copy, username, errors (413, 503, offline) and unlink; linking a second device; a pull redrawing Stats; the export download parsed; the reset dialog; the reset reaching a second device; a failed map load giving a notice instead of an alert.\n- `pages/check-stats.js`: 112 assertions desktop. It compares the printed figures with the stores, and covers the toggles, \"Practice these\" (the playlist asks exactly the listed places and leaves records and focus lists alone), a new player and old stores.\n- `shell/check-shell.js`: 179/179 --mobile. Desktop was 182 passed and 1 failed; the failure was the layout check's key-press loop ending before seven reveals had played out. I lengthened the loop and re-ran that check alone: pass.\n\n**Run before the last small commit, not repeated after it**\n- `check-stats.js` --mobile: 114 passed, run before the Settings commit.\n- `logic-tests/run-all.sh`: all green after the Settings commit (t1 37, t2 46, t3 39, t4 67, t5 4, t6 7, t7).\n\n**Suite changes, all expectations out of date with intended behaviour**\n- check-shell: places skipped in a review are due again the same day (mastery spec); the sync lines now expect the Settings card and dialog; a back-button and lazy-province-data check was added.\n- logic-tests t1 to t4: old-menu selectors (`data-folder`, `.daily-card`, the focus chooser), stale since the Home commit, now target Home and the level sheet.\n- logic-tests t4 and t5: sync adapters now drive the Settings card.\n- logic-tests t6: one comparison depended on shuffle order.\n- Originals are in `logic-tests/_out/*.before-settings.js`. No check was weakened to hide a failure.\n\n**Dataviz validator**: run on the mastery and heat ramps in both themes. Lightness order and step gaps pass; the empty step fails contrast and single-hue, as noted in the summary.\n\n**Screenshots looked at** (`shots/app/pages/`, plus `shots/app/closeout/` and `shots/app/shell/co-*`)\n- Stats: rich and new player, desktop and phone, light and dark.\n- Settings: sync off and on, desktop and phone, both themes, and the sync error state.\n- Dialogs: create, code ready, link with an error, reset (synced and unsynced), copy fallback.\n- Transient pieces: toast (right and wrong), notice, loading card.\n- Taken but not looked at: the unlink and add-device dialogs (the same component as the ones above).\n- Not seen: the record banner on its own. That capture was mid-fade; the banner is visible only behind the copy dialog.",
  "notDone": [
    "CLAUDE.md and atlas_handoff.md were not updated. They still describe the old menu tree and the sync modal, and do not mention Stats, Settings or the dialog.",
    "The game and results screens keep their old layout. Only the toast, map hints, imagery credit, loading card and record banner were restyled.",
    "The record banner in the dark theme was not looked at, and its light-theme capture was mid-fade.",
    "Real Cloudflare KV, the live site and real Esri tiles were not exercised. Sync ran against a stand-in server inside the test process.",
    "The share sheet (navigator.share) was not exercised; only the copy-link path and its copy-by-hand fallback were.",
    "The mastery ramp and heat ramp tokens fail two validator checks on their empty step (contrast against the surface, single hue). Left as the design fixes them.",
    "There is no hover layer on any chart. This is deliberate (owner rule); the dataviz skill's default was not followed there.",
    "check-stats.js --mobile and the logic suites were last run before the final small commit (focus handling and redraw on another tab's change), not after it.",
    "The unlink and add-device dialog screenshots were taken but not looked at.",
    "The Daily Five's best streak covers only the 30 days the store keeps.",
    "The three design-system utilities .display-m, .display-s and .tnum are still unused; I left them for the game and results stages."
  ],
  "notesForNextStage": [
    "Stats lives in the STATS section (before GAME): `renderStats()` draws into `#stats-content`. Chart components are `.kpis`/`.kpi`, `.figs`, `.mtable` (mastery table, `toggleStatsGroup`), `.cal` with `.heat-legend`, `.weak` with `.meter`, `.strip`, `.cols` (column chart, value on each cap), `.hbar` with `.pintable`, and `.records` (desktop table) with `.recs` (phone rows).",
    "A mastery globe would join Stats as another panel inside `.panels`. The Mastery panel spans two grid rows (`.panel--tall`), with Activity and Needs work stacked beside it.",
    "Settings lives in the SETTINGS section. `renderSettings()` builds the page once into `#settings-content`, then only refreshes controls (`syncThemeControls`, `syncMotionControl`, `syncPlayControls`, `renderSettingsSync`). Add a group with the local `group(key, title, text, body)` helper.",
    "Dialog API (DIALOG section): `openDialog(html)`, `closeDialog()`, `dialogContent(title, body, actions)`, `confirmDialog({ title, body, confirm, danger, onConfirm })`, `copyDialog(title, text)`, `copyText(text, doneNotice, fallbackTitle)`. Markup is `#dialog` and `#dialog-scrim`.",
    "In a dialog, `data-autofocus` picks the first focus and `data-submit` marks the button that Enter in a field presses. One keydown handler serves the dialog and the level sheet.",
    "`switchScreen` closes the dialog. Do not use `alert`, `confirm` or `prompt`; use the dialog, or `showNotice(text)` for a message.",
    "Sync UI ids: `#sync-now-btn`, `#sync-status-line` (gets `is-error`), `#sync-title`, `#sync-key-display`, `#sync-key-show`, `#sync-key-copy`, `#sync-username-edit`, `#sync-disconnect-btn`. In dialogs: `#sync-username-new`, `#sync-create-btn`, `#sync-key-input`, `#sync-import-btn`, `#sync-import-status`, `#sync-code-full`.",
    "The navigation's sync light is `[data-sync-dot]`: hidden when sync is off, `.is-error` after a failed push or pull. `syncRefreshEntry()` updates it and the status line in place.",
    "`syncOpenModal` and every `.sync-modal*` class are gone.",
    "Review playlists take any names: `reviewGroups(pick)`, `buildReviewPlaylist(groups)`, `startReview(groups)`; with no argument `startReview` reviews what is due. `startWeakPractice()` is the Stats action.",
    "`dailyDays(n)` replaced `dailyWeek()`.",
    "`state.worldFailed` is set when the world map cannot load. `renderHome` shows the error; `renderStats` still draws from the stores. `loadLevelData` tolerates a level whose load has not begun.",
    "The `storage` event now calls `refreshView()` after `mastery.reload()`.",
    "`setMotionPref('reduce' | 'full')` stores `atlas-motion` and sets `data-motion` on `<html>`. `reducedMotion()` is the test to use before any scripted animation; the map's zoom transitions do not consult it yet.",
    "Seeds: `require('$S/harness/seed-rich.js').makeSeed({ weeks, seed, playedToday, now })` returns a localStorage object. The CLI writes `$S/harness/scratch/seed-rich.json`; `--unplayed` leaves today's Daily Five unplayed. `seed.summary` (non-enumerable) holds the totals.",
    "`seed-rich.js` hardcodes the record-key regions in `regionOf()`; a new mode needs an entry there.",
    "Trap: one very tall headless capture repeats itself past about 8,000 device pixels, which is what made Home look duplicated. Use `pages/shoot.js --pages` for tall phone views; `--full` is safe only on desktop.",
    "Trap: the game-to-results fade can take several seconds under software rendering. Wait about 3 seconds or more before a results screenshot.",
    "`pages/shoot.js` flags: `--hash`, `--url`, `--seed`, `--dark`, `--mobile`, `--js`, `--scroll`, `--finish`, `--pages`, `--syncfail=<status>`. It carries a stand-in sync server.",
    "`pages/check-stats.js` and `pages/check-settings.js` take `--mobile` and `--only=<name>`. Run them after touching Stats, Settings, sync or the dialog.",
    "The logic tests in `$S/work/integration/logic-tests` now drive Home cards by `[data-level]`, the level sheet, and the Settings sync card. `shell/check-shell.js` is the interaction suite for the shell, Home and the sheet.",
    "CLAUDE.md drift to fix in a docs pass, on top of the logic stage's list: the menu tree and focus chooser are gone (Home and the level sheet); sync lives in Settings with dialogs; the Stats and Settings views, the theme and motion keys (`atlas-theme`, `atlas-motion`), and the export and reset features are new."
  ]
}
// The game screen stage and the first globe round finished in run wf_7d6043e5-4b2; copied from its journal.
const GAME_DONE = {
  "summary": "The game screen chrome and the results screen are finished and pushed (last commit 794cdf9); every suite passes on the final tree.\n\n**Where the interrupted attempt stood.** The CSS and markup were already in the checkpoint, and the uncommitted part was JavaScript only, ending at the Learn results. I continued from it rather than restarting. The orchestrator's checkpoint e5d2554 swallowed my first commit, so the described history is f483d1b and 794cdf9.\n\n**Game screen**\n- The map is one full-bleed stage (`#map-wrap`) under floating HUD pieces. The map and the prompt card keep their size through a round in every mode (B2, checked by measurement).\n- The game bar has back, title, kind tag (Practice / Review / Learn), difficulty tag, \"23 of 54\", score, a running clock and a progress line.\n- One prompt card serves every mode: second-try marker, capital choices, Pin the City's country and distance line, Learn study and quiz labels.\n- A place found on the second try now keeps its own mark on the map (`completed-second`), and the tally of found / second try / missed doubles as the legend.\n- Phones: prompt at the top, Skip bottom centre, controls lower right, tally lower left. All controls measure at least 44px.\n- Fixed: D15 (no `title=` anywhere), D8 (the Learn zoom-in pill stays), B5 (a right answer shows on the prompted state at once), and invisible keyboard focus on Skip, Drop pin and the map controls.\n\n**Results screen**\n- `renderResults(r)` draws every variant from one description: full round, practice, Daily Five and its practice replay, Smart Review with \"Next: \u2026\", Pin the City, and Learn finished.\n- It shows the three-arc ring, record badge, outcome figures, mastery gain, personal bests, and the revisit list with what was chosen and where each name stands.\n- Share text is unchanged: the three builder functions are identical to 231dffc.\n- The results countdown was staying empty whenever Home's daily card existed; it now fills every counter.\n- D2 is fixed for this screen.\n\n**Additions and wording changes you did not ask for**\n- A finished Learn ladder now offers \"Full round\" plus a one-line note.\n- The wrong-tap toast reads \"Not quite \u2014 that's Mali\".\n- Pin the City's \"Last km\" figure moved from the bar into the prompt card.\n\n**Sweep.** Removed the dead `showReviewNext`, the unread `promptLabel` / `recordsLabelSuffix` fields, seven unused palette colours, and two class names nothing styled. No unused keyframes, no hardcoded colours outside token blocks and the theme preview tiles.\n\n**Suite changes.** Six suite files were updated because they read markup this stage changed on purpose (listed in the checks); none was weakened. The dated seed files were regenerated because the UTC day rolled over mid-run.",
  "commit": "794cdf9",
  "checks": "All on the final tree unless noted.\n\n- **Syntax:** `node --check` passes on both inline script blocks.\n- **Smoke:** `harness/smoke.js` 13/13 desktop and 13/13 `--mobile`.\n- **New stage suite:** `work/integration/game/check-game.js` \u2014 109 passed on desktop. The full phone run (114 passed) was before the last two small edits; a phone rerun of the hud, results and pin groups afterwards passed 72/72. It covers B2 by measuring map and card rects, no backdrop-filter, 44px targets, every prompt label, the pin flow, the Learn ladder to its end, all results variants and their buttons, clipboard share text, review mode, the record badge, and the keyboard shortcuts.\n- **Shell:** `shell/check-shell.js` 183 desktop, 179 `--mobile`.\n- **Stats and Settings:** `pages/check-stats.js` 112 / 114, `pages/check-settings.js` 93 / 93 (desktop / phone).\n- **Logic:** t1\u2013t7 and `v-b4-learn` all green, mastery paste check included. This run was before the last few edits (a class toggle, two strings, CSS); smoke and check-game cover those.\n- **Keyboard focus:** `game/probe-focus.js` shows a ring on every game control in tab order.\n\n**Suite adapters updated for intended changes**\n- `logic-tests/lib.js`: the wrong-target pickers skip `.completed-second`.\n- `t6-duplicate-names.js`: the pin country is read from `#prompt-note`.\n- `check-shell.js` and `check-stats.js`: the Next button is hidden with the `hidden` attribute; the kind is read from `#game-kind`; `.results-bar` replaces `.results-kicker`; the Home share button is found by its action.\n\n**Screenshots:** 64 in `shots/app/game/` (16 scenes \u00d7 desktop/phone \u00d7 light/dark, from `game/shoot-all.sh`), plus three landscape-phone and tablet shots. I looked at about 40, including at least one of every scene and both themes at both sizes.\n\n**Seen and left alone**\n- Hard on Europe shows the whole world with the sphere's edge inside the stage. This is the old SVG map's framing.\n- On a 390px-high landscape window the prompt card covers the pin reveal.",
  "notDone": [
    "CLAUDE.md and atlas_handoff.md were not updated. They still describe the old HUD and results screen, and do not mention the second-try mark, the clock, or the results actions.",
    "The map itself is untouched, as briefed. Europe still frames the whole world, the pin reveal centres on the stage rather than the clear area, and zoom transitions ignore reduced motion.",
    "The revisit list shows \"6 of 9 first try\" instead of the mockup's last-five dots; the mastery store keeps no per-item history.",
    "The mockup's view/zoom readout and the name label over a wrongly tapped country were not built; both belong to the globe.",
    "The native share sheet (navigator.share) was not exercised; only the clipboard path and the Copied state were.",
    "Real Esri tiles, the live site and real Cloudflare KV were not exercised.",
    "About 24 of the 64 matrix screenshots were generated but not looked at individually; each is a theme or size variant of a scene I did look at.",
    "The unused type utilities .display-m, .display-s and .tnum and the unread --bg-glass token were left in place for later screens that lift from design A.",
    "The first described commit was swallowed by the orchestrator's checkpoint e5d2554, so that commit's message is generic. I did not rewrite history."
  ],
  "notesForNextStage": [
    "Stage: `#map-wrap.stage` is absolute, inset 0, under the HUD. Put the globe canvas and overlay inside it. `.sat-credit` lives in the stage and shows on `.stage.sat-on`; `.stage.no-borders` is Uncharted; Pin Hard is `#game-screen.pin-hard`.",
    "`stageClearArea(width, height)` returns `{left, right, top, bottom}` in stage px that the HUD leaves free. Aim fit and fly-to at its centre, not the stage's. Call it after `setGameChrome()` and `switchScreen('game')`, because it measures the laid-out HUD.",
    "On stages under 720px wide the controls and tally sit over the map's lower corners on purpose; `stageClearArea` reserves nothing for them there.",
    "Map colours are the `--g-*` tokens. `.stage.sat-on` redefines them, and `--good/--second/--bad` for dots, over imagery.",
    "Marks are still DOM classes on the SVG: `completed-correct`, `completed-second` (new), `completed-wrong`, `target-correct`, `target-wrong`, `reveal`, `prompt-highlight`, `learn-known`, `learn-new`. `foundMark(points)` picks the found class; `isMarked(el)` says an item takes no more answers.",
    "The resize handler and review mode (`showRoundMap()`, class `review-mode`) depend on the map keeping its marks as the round ended. A canvas globe must hold that state in JS.",
    "CSS order matters for B5: the mark rules under \"Marks, weakest first\" must keep flash and reveal after `prompt-highlight`.",
    "HUD API: `setGameChrome()`, `setPrompt(label, name)`, `setPromptTry(on)`, `shakePrompt()`, `updateStats()`, `roundProgress()`, `startClock()` / `stopClock(finalSeconds)`, `showToast(kind, html)`, `setPinButton(label, disabled)`, `setLearnHint(on)`.",
    "`setGameChrome()` sets the mode classes on `#game-screen`: `pin-mode`, `pin-hard`, `learn-mode`, `city-mode`.",
    "HUD ids: `#region-tag`, `#game-kind`, `#game-diff`, `#game-sub`, `#game-count`, `#game-of`, `#game-track`, `#stat-score` and its label, `#stat-extra` with label and value, `#stat-time`, `#prompt`, `#prompt-label`, `#prompt-try`, `#prompt-country`, `#prompt-note`, `#choices-panel`, `#toast`, `#game-legend`, `#legend-found`, `#legend-second`, `#legend-missed`, `#zoom-hint`, `#learn-hint`, `#skip-btn`, `#learn-ready-btn`, `#pin-btn`, `#pin-btn-label`, `#map-style-btn`, `#back-btn`, `#review-back-btn`.",
    "Buttons and hints are shown and hidden with the `hidden` attribute, not `style.display`.",
    "Results: `renderResults(r)`; the shape of `r` is documented above the function. Fixed buttons are `#review-next-btn`, `#practice-btn`, `#full-btn` (new), `#replay-btn`, `#daily-practice-btn`, `#view-map-btn`, `#share-btn`; the rest is drawn into `#results-summary` and `#results-detail`.",
    "New data-actions: `share-results` and `view-map`.",
    "New state: `state.picks`, `state.roundLog` (name -> { picks, skipped }), `state.gainStart` (mastery snapshot at round start), `state.clock`. `scoreAnswer(points, skipped)` takes a second argument.",
    "Helpers: `masterySnapshot()`, `renderGain()`, `renderMasteryBar(summary, extraClass, fresh)`, `flashCopied(btn)`, `shareTextOrCopy(text, title, btn)`.",
    "`startDailyCountdown()` now fills every `[data-countdown]` on the page.",
    "`GAME_MODES` entries hold only `dataset` and `label`. Prompt labels are set in `nextCountry()` and `startLearnLevel()`.",
    "The screen-reader-only utility class is `.vh`; there is no `.sr-only`.",
    "Stage tools are in `$S/work/integration/game/`: `check-game.js` (`--mobile`, `--only=hud,capitals,pin,learn,results,daily,review,keys`), `shoot.js` (flags in its header), `shoot-all.sh`, `probe-focus.js`.",
    "Trap: Playwright scripts over the map need `--disable-gpu-compositing` or screenshots time out; `shoot.js`, `check-game.js` and `smoke.js` patch `chromium.launch` for this.",
    "Trap: the seed files are dated. After a UTC day change regenerate them with `node $S/harness/seed-rich.js`, the same with `--unplayed --out=$S/harness/scratch/seed-rich-unplayed.json`, and `node shell/gen-seed.js`; otherwise the daily and stats checks fail by one day.",
    "Trap: the orchestrator commits checkpoints of the working tree while you work. `git commit` may report nothing to commit; check `git log` before assuming your work is uncommitted.",
    "SVG-specific test adapters to rewrite for the globe: `logic-tests/lib.js` (`pathFor`, `wrongPath`, `clientPoint`), the MAP ADAPTER in `harness/smoke.js`, and the `.country.completed-*` / `.city-dot.*` selectors in `game/check-game.js`."
  ]
}
const GLOBE_ROUNDS_DONE = [{
  "summary": "Round 1 finished M1 and M2 of five; both are committed and pushed (57951e4, 568c5ed). Every mode except Pin the City now plays on the WebGL globe, and every mode is playable at that commit. M3\u2013M5 are not started.\n\n**What is on the globe now**\n- **M1:** The World, the six continents and the Daily Five. The engine is pasted byte for byte into the script, and its libraries and the world map load from the app's own origin.\n- **M2:** US states, both capital modes, the city rounds with their dots, and all province rounds including Learn (names from the engine's anchors, laid out again when a zoom settles, with the zoom-in pill).\n- **Ahead of plan:** satellite and Uncharted already run through the engine's imagery in all of these modes, with the Esri credit, the loading note and the failure fallback. M3 still owes a check of them in every mode.\n\n**Design choices the next engineer should know**\n- The globe's centre is the centre of what the HUD leaves clear. The engine always centres the globe in its host, so `#globe-host` overhangs the stage's top or bottom edge, and each round's opening view is fitted to the clear area by measuring with `project()`.\n- Continents open on curated boxes rather than a fit to their countries. The United States open on the lower 48, so Alaska and Hawaii are a turn away on desktop.\n- Marks, reveals, tints, outlines, dots and Learn names are plain data in a `map` object and painted from it, so theme changes, resize and \"View on the map\" need no restoring.\n- A reveal that zooms in on a speck zooms back out when it ends. This is new behaviour.\n\n**Bugs found and fixed along the way**\n- The globe canvas swallowed clicks on Home while the game screen was hidden.\n- The first prompt's turn to Hawaii or Alaska was undone by the opening view being set after it.\n- A round could start while its map was still being built, which lost the first tap intermittently on phones.\n\n**Verification on the final tree**\nAll suites pass at desktop and phone size, including the two paste checks. I looked at 15 screenshots covering world, continent, US, cities, provinces and Learn in light and dark, on chart and satellite, plus Uncharted and a reveal. Details are in `checks`.\n\nProgress notes, including a step-by-step recipe for moving Pin the City, are in `/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad/work/integration/progress.md`. The stage's tools and logs are in `/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad/work/integration/globe-stage/`.",
  "commit": "568c5ed",
  "checks": "All run on the final tree (568c5ed) unless noted.\n- Syntax: `node --check` on both inline script blocks passes.\n- Paste checks: globe engine and mastery module are byte-identical to their source files.\n- Smoke suite: 13/13 desktop, 13/13 `--mobile`. All map input was real clicks or taps, none synthetic.\n- `globe-stage/check-globe.js` (new): 56/56 desktop, 54/54 phone. It covers picking rules (Barbados from open water, Saudi Arabia beside Bahrain, Greenland inert), Hard keeping no marks, a double tap counting as two answers with no zoom, a drag answering nothing, the hover cursor, zoom keys and buttons, Europe's frame inside the clear area, M keeping marks, resize refit, review mode, imagery failure, the prompted state in view (Hawaii, Alaska), DC inert, nearest of two crowded dots, India's scattered territories tappable at the opening view, and Learn names, pill and zoom-in.\n- `game/check-game.js`: 110/110 desktop, 115/115 phone.\n- Logic tests `run-all.sh` (t1\u2013t6): all pass.\n- Not re-run: `shell/check-shell.js`, `pages/check-stats.js`, `pages/check-settings.js`.\n\nSuite changes, none weakened:\n- Smoke adapter and `logic-tests/lib.js` gained globe halves, chosen per round by `state.onGlobe`.\n- `check-game.js` reads marks from `map` instead of SVG classes. Its B5 check now asserts the prompted state takes its mark at once. Its two clock checks and its zoom check no longer assume machine speed, because software rendering stretches the engine's animations.\n- The D6 test (t3) aborts the self-hosted world file instead of the CDN one.\n- t6's app copy now links `vendor/`.\n\nScreenshots looked at, in `shots/app/globe/`: m1-world-d-light, m1-africa-d-light, m1-europe-m-dark, m1-reveal-d-light, m1-africa-sat-d, m1-unch-d, m1-world-m-light, m2-us-d-light, m2-capitals-m-light, m2-cities-d-light, m2-india-learn24-d-light, m2-russia-south-sat-d, m2-canada-learn-m-light, m2-china-m-dark, tmp-trace (wrong-answer toast).",
  "notDone": [
    "M3: Pin the City is still on the SVG map with the CPU satellite canvas. Satellite and Uncharted have not been checked mode by mode. Nothing yet shows Satellite or Uncharted as unavailable when the engine reports no imagery support (Canvas 2D).",
    "M4: the SVG renderer (`renderMap`), d3.zoom, the CPU satellite code, their CSS, the cdnjs script tags, `ensureTopojson`, the us-atlas CDN fallbacks and `parallels` are all still in the file. The 110m first paint with a swap to 50m is not built; the app loads 50m only.",
    "M4 edge cases not exercised: phone rotation mid-round, a lost WebGL context, and a full round on the Canvas 2D fallback. Resize was checked for marks and refit only.",
    "Reduced motion is partial. The game passes its own setting to fly-to, zoom and the reveal pulses, but the engine's drag inertia and wheel easing follow the OS setting only. Honouring the in-app switch there needs an engine option, then a rerun of its tests and a fresh paste.",
    "M5: no measurements taken.",
    "Screenshots not yet looked at: review mode, Hard, the Canvas 2D fallback, Pin the City before and after a drop, Learn quiz phase, a phone on its side. m1-daily-d-dark and m2-us-capitals-d-dark were taken but not opened.",
    "Known wart: in Russia rounds over imagery, Crimea shows as untinted imagery at the same brightness as the round's own provinces. The world file's Russia includes it and the province file does not. A tap there does nothing.",
    "Known wart: `check-game.js` \"hud: the prompt card kept its size\" compares width as well as height and failed in two of four desktop runs, with a different width each time. I believe the card widens for a long name but did not confirm it. It passed on the final run and I left the check unchanged.",
    "The found mark over imagery could not be judged: the stand-in tiles are green and the mark is see-through green. Real Esri tiles, the live site and a real GPU were not exercised.",
    "`shell/check-shell.js`, `pages/check-stats.js` and `pages/check-settings.js` were not re-run this round.",
    "CLAUDE.md and atlas_handoff.md still describe the SVG map, flat projections, the CPU satellite canvas and CDN libraries."
  ],
  "notesForNextStage": [
    "Read the globe-stage section of progress.md first. It lists every new function and has a step-by-step recipe for moving Pin the City (M3).",
    "`playedOnGlobe(mode)` is the per-round renderer switch; today it is `mode !== 'city-pin'`, and `state.onGlobe` holds the result. Make it true for all modes in M3, then delete both in M4.",
    "`const map` in the MAP section holds the game's map state: globe, layer, layerSet, drawn, drawing, provinces, eligible, marks, shown, tints, promptKey, outlines, reveal, dots, dotMarks, dotShown, dotHover, labels, home, clear, ink, round.",
    "Per-round calls: `syncMapLayers()` (awaited in `startGame`), `applyMapStyle()`, `setupMap()`, `frameMap()`. Helpers: `paintMap()`, `paintFeature(key)`, `paintContext()`, `featureStyle(key)`, `canPick(key)`, `answersOnShapes()`, `roundFrame()`, `eachPosition()`, `placeGlobeHost()`, `mapAtHome()`, `bringIntoView(target, { keepZoom })`.",
    "Answer and overlay functions: `onMapClick`, `onMapMove`, `answerFeature(key)`, `answerCity(name)`, `flashFeature(key, 'good'|'bad', ms, mark)`, `flashDot`, `revealTargetFeature`, `revealMissedCity`, `setPromptFeature`, `dotNear`, `drawMapOverlay`, `drawCityDots`, `drawLearnLabels`, `drawRevealRings`, `placeLearnLabels`, `clearLearnStudy`.",
    "Style names: land, dim, hover, found, second, missed, good, bad, reveal, prompt, learnKnown, learnNew, hidden. `foundMark(points)` returns 'found' or 'second'. Layer ids are world, us, prov (`MAP_LAYERS`, `DATASET_LAYER`).",
    "`applyMapLook()` reads the `--g-*` tokens from `#map-wrap` and is the one place colours reach the engine. It runs on theme change, map-style change and imagery status. `applyMapClasses()` sets `.sat-on` and `.no-borders`; `onImageryStatus(status)` handles loading, ready and failed.",
    "Trap: `globe.setLayers` resets every layer's settings, styles and hover, including layers it does not rebuild. Only call it through `syncMapLayers()`, before `setupMap()`, never mid-round.",
    "Trap: host px are not stage px vertically. `#globe-host` overhangs the stage so the globe sits at the clear area's centre. `map.clear` is in host px; `-host.offsetTop` converts to stage px. Do not use the engine's `fitTo` padding or `ensureVisible` margins for HUD clearance; use `frameMap()` and `bringIntoView()`.",
    "Trap: `startGame` is now asynchronous for every globe round. Tests must wait for `state.current`, plus `map.round === state.roundId && map.drawn` for map readiness.",
    "Trap: in the 80 ms start timer `frameMap()` must run before the first prompt, or it undoes the turn a first prompt asks for.",
    "Trap: do not put `pointer-events: auto` on the globe host. An inactive screen is only `opacity: 0; pointer-events: none`, and the host would then take clicks meant for Home.",
    "Trap: do not edit `public/index.html` while a suite is running; the harness serves it live.",
    "Trap: under software rendering the engine's animations run slower than real time (frame dt is capped at 50 ms). Tests should wait for a view to arrive, not sleep a fixed time. With `fast: 25` a reveal lasts 104 ms, so read reveal state in the same `evaluate` as the tap.",
    "Hook additions: `window.__atlas.map` and `window.__atlas.globe` (a getter).",
    "Test tools: `globe-stage/gshot.js` takes screenshots (`--plan=f,s,m,k,w` plays real clicks, `--learnlevel=N`, `--sat`, `--diff=`, `--dark`, `--mobile`, `--nogl` for the Canvas 2D fallback, `--tiles=fail`, `--js=`). `globe-stage/check-globe.js` takes `--mobile` and `--only=picking,tiny,hard,input,view,review,us,provinces,imageryfail`. `logic-tests/check-globe-paste.js` compares the pasted engine with globe.js.",
    "`logic-tests/lib.js` globe helpers: `T.keyFor`, `T.tapAt` (dispatched PointerEvents on the host), `T.aimKey`, `T.tapKey`, `T.wrongKey`, `T.marks()`, `T.zoom()`, `T.mapEl()`.",
    "Still SVG-only in the tests, for M3: smoke adapter `pinPoint` and `farPoint`; lib.js `T.clientPoint` and the pin click in `answer()`; the pin lines in `check-game.js`. Delete the SVG halves of the adapters in M4. `harness/smoke.before-globe.js` is a copy of the suite from before this stage.",
    "Still in the file for Pin the City only: `renderMap`, `ensureFeatureVisible`, the whole CPU satellite section, the SVG map CSS (including now-dead `.city-dot`, `.learn-label`, `.reveal-marker`, hit-zone rules), the resize handler's SVG branch, `handlePinClick`, `drawPinLayer`, `scalePinMarkers`."
  ],
  "done": false,
  "milestonesDone": [
    "M1",
    "M2"
  ]
}]
const PIN = Object.assign({ pages: PAGES_DONE, game: GAME_DONE, globeRounds: GLOBE_ROUNDS_DONE }, (args && args.pinned) || {})
// What an interrupted attempt at the next live stage left behind, written by the orchestrator at relaunch.
const RESUME = (args && args.resumeNotes) || {}
const resumeNote = t => t ? '\nWHERE THE ATTEMPT BEFORE YOURS STOPPED (written by the orchestrator):\n' + t + '\n' : ''

// The stage built and pushed its work in two commits and was then cut off by a usage limit before its
// closing checks; this record was written by the orchestrator from its progress notes and commits.
const shell = {
  summary: 'Built and pushed in two commits before a usage limit cut the stage off; its closing checks were ' +
    'not run. 0adb5d5: the design system (semantic tokens over the brand palette, light and dark themes with ' +
    'the no-flash head script, Cormorant Garamond + Inter), the shared components, and the app shell (VIEWS ' +
    'registry, top nav and phone tab bar, #stats and #settings hash views with placeholder pages, theme ' +
    'toggle, streak chip, a sync row in Settings); the legacy game, results and sync CSS was re-pointed at ' +
    'the semantic tokens. 3f66458: Home (masthead with real figures, the Daily Five card in both states, ' +
    'Smart Review with its playlist, the Library drawn from LEVELS with every card visible) and the level ' +
    'sheet replacing the focus chooser; the old menu tree, the focus chooser and their CSS are gone.',
  commit: '3f66458',
  checks: 'Smoke suite 13 of 13 on desktop after each commit. Screenshots looked at: shots/app/shell/a-*, ' +
    'b-home-*, c-sheet-* (light and dark, desktop and phone). NOT run: smoke --mobile, keyboard and focus ' +
    'checks, game and results screenshots after the Home commit.',
  notDone: [
    'Interaction checks were never run: keyboard use and the focus trap in the level sheet; every start path ' +
      'from the sheet (Play, Focus practice, Learn and its start-over link); the Smart Review playlist end to ' +
      'end including "Next" on the results screen; hash navigation with the back button and hand-typed ' +
      'hashes; level cards filling in as lazy province data arrives.',
    'smoke.js --mobile was not run after the Home commit.',
    'The game and results screens were not re-checked in both themes after the Home commit.',
    'No sweep for dead code and dead CSS after the old menu tree was removed.',
    'The phone full-page screenshot shots/app/shell/b-home-rich-mobile-dark.png shows Home twice, one copy ' +
      'under the other (the page seems to start again after the Provinces & States heading). Not ' +
      'investigated: it may be real duplication or a scroll-container problem at phone width, or an artifact ' +
      'of the full-page capture.',
    'A brand-new player and a returning player with an old store were built for, but there is no record ' +
      'that either was looked at.',
  ],
  notesForNextStage: [
    'Working files of the stage: ' + S + '/work/integration/shell/ (seed-rich.json = played today, ' +
      'seed-rich-unplayed.json, seed-old.json = no mastery; gen-seed.js regenerates them; shoot.js takes view ' +
      'screenshots and accepts --js to click; shoot-game.js for the game screens).',
    'Stats and Settings exist as placeholder views; Settings already holds the sync row.',
    'Smart Review leaves Pin the City out because its practice rounds would be saved as full games.',
    'The stage wrote no closing report: grep public/index.html for the names you need (VIEWS, the level ' +
      'sheet, the Home render functions) instead of expecting a list here.',
  ],
}
if (!shell) throw new Error('shell stage returned nothing')
done.push(Object.assign({ stage: 'Shell, Home, level sheet' }, shell))
log('Shell: ' + (shell.commit || 'no commit'))

// ---------- Pages ----------
phase('Pages')
const pagesPrompt = COMMON2 + notes(done) + `
FIRST, close out the stage before yours. It built and pushed its work but was cut off before its final
checks (its report above lists them under "Not done"). Run them now: the smoke suite on desktop and with
--mobile, the interaction checks, the question of Home appearing twice at phone width, a brand-new player and
a returning player with an old store, the game and results screens in both themes. Fix what they turn up and
commit and push that on its own before you start on Stats.

THEN YOUR STAGE: the Stats and Settings pages (PLAN.md section 2, "Stats" and "Settings"), on the shell and
components the previous stage built. Look at ${S}/shots/design/a/stats-*.png and settings-*.png and lift
from ${S}/work/design/a/src/styles.css and body.html.

Stats — every panel in PLAN.md with real data from the stores (atlas-records, atlas-pin, atlas-daily-attempts,
atlas-focus, atlas-mastery; shapes in ${S}/maps/ui-inventory.md section 4 and what can be computed in 4.2):
KPIs, mastery by collection and level, the 12-week activity calendar, needs-work list with a working
"Practice these" action, the records table (desktop table, phone rows), Daily Five history, Pin the City
figures. Every number printed (no hover layer, no title= tooltips). Real empty states for a new player.
Load the dataviz skill before you draw the charts and follow it for the calendar, bars and legends; the
mastery ramp and outcome colours are fixed by the design tokens. Re-render when the view is shown and after
a sync pull changes data. Records labels must be human titles from LEVELS, mapped from the stored keys
without changing the keys.

Settings — theme (three options with A's preview tiles), default difficulty, map style, reduce motion, Sync
(the whole existing flow restyled: not set up / set up states, username, show-hide and copy the sync code,
link another device, sync now, last synced, error states including the 413 the logic stage surfaced,
unlink), Data (Export my progress → downloads a JSON file via exportProgress(); Reset progress → a confirm
dialog that lists what is erased and uses the reset function from the logic stage; verify the reset reaches
a second device through a simulated sync round-trip), About (what the app is, credits for Natural Earth,
Esri World Imagery and the fonts, a share-the-app action). Restyle the sync modal steps (inventory section
1.4) and every remaining dialog/toast/banner in inventory sections 1.4-1.6 to the new components, in both
themes. Remove the old sync entry from Home once Settings owns it.

Screenshots to take and look at (save under ${S}/shots/app/pages/): stats and settings at desktop and phone
in both themes, with (a) a new player, (b) a rich seeded player — build a seeding script that plays or writes
a realistic history across several weeks (records, daily attempts, pin games, mastery with a spread of
levels and due items; mastery.js accepts an injected clock for building history) and keep it at
${S}/harness/seed-rich.js for later stages; (c) sync set up and not set up; (d) the reset dialog and each
sync modal step.
`
const pages = PIN.pages || await agent(pagesPrompt, { label: 'stats-settings', phase: 'Pages', schema: STAGE_SCHEMA })
if (!pages) throw new Error('pages stage returned nothing')
done.push(Object.assign({ stage: 'Stats and Settings' }, pages))
log('Pages: ' + (pages.commit || 'no commit'))

// ---------- Game ----------
phase('Game')
const gamePrompt = COMMON2 + notes(done) + `
YOUR STAGE: the game screen chrome and the results screen (PLAN.md section 2, "Game screen" and "Results
screen"). Look at ${S}/shots/design/a/game-*.png and results-*.png; lift from styles.css and body.html.
Read ${S}/maps/ui-inventory.md sections 5, 6, 8.6 and 9 first — they list every HUD and results variant and
the JS-toggled selectors.

The map itself is replaced by a WebGL globe in the NEXT stage. Do not rework map rendering, projections,
zoom or satellite code now. Build the chrome so that the map area is one full-bleed stage element
(#map-wrap or its successor) under absolutely positioned HUD pieces, with the SVG map still working inside
it and reading its colours from the --g-* tokens in both themes.

Game HUD: game bar (back with the existing leave behaviour, title + difficulty tag, "23 of 54", score, time,
progress line), prompt card with every variant (find-on-map, both capital modes including the choice
buttons of States → Capitals, city modes, Pin the City with Drop Pin and the distance/points readout, Learn
study and quiz panels with their progress, review mode, practice and Smart Review labels), feedback toast,
Skip with its key cap on desktop, map controls as icon buttons with aria-labels and no title= (fix D15),
outcome legend, zoom-in pill for Learn, the Esri credit when imagery shows, Uncharted. Fix D8 (the Learn
hint fades after 5 s) and B5 (prompt highlight overriding flashes) if they are chrome-side. Phone layout as
PLAN.md section 1 says; nothing over the map uses backdrop-filter; controls are at least 44px targets on
touch; the HUD must not shift the map's size after the first question renders (bug B2 in
${S}/maps/map-port-checklist.md — reserve the space).

Results: score ring, record badge, outcome counts, time and accuracy, mastery gain (capture the level's
mastery.summary when the round starts and compare at the end), the revisit list, and the actions in PLAN.md;
every variant in inventory section 5.2 (full round, daily with its share grid and countdown, practice,
Smart Review with "Next: …" while the playlist has more, Pin the City with distances, Learn finished).
Share text stays byte-for-byte what it is today. Fix D1/D2 for this screen if still present.

Then sweep the whole file for leftovers of the old look: dead CSS, unused keyframes, unused functions and
markup (ui-inventory D13 lists known dead code), hardcoded colours where a token exists, title= tooltips.

Screenshots to take and look at (save under ${S}/shots/app/game/): at desktop and phone, light and dark —
a continent round mid-game with found / second-try / missed marks and a wrong-tap toast; States → Capitals
with choices; a US Cities round; Pin the City before and after a drop; Learn study and quiz; review mode;
Hard; Uncharted with mock satellite tiles; results for a full round with a record, a daily, a practice
round, a Pin round. Compare against the mockups and close the gaps.
`
const game = PIN.game || await agent(gamePrompt + resumeNote(RESUME.game), { label: 'game-results', phase: 'Game', schema: STAGE_SCHEMA })
if (!game) throw new Error('game stage returned nothing')
done.push(Object.assign({ stage: 'Game HUD and results' }, game))
log('Game: ' + (game.commit || 'no commit'))

// ---------- Globe ----------
phase('Globe')
const globeBrief = `
YOUR STAGE: put the game on the globe. Replace the flat SVG map and the CPU-reprojected satellite canvas with
the WebGL globe engine in every mode, and remove the old renderers.

Why: the owner asked for a globe instead of a flat map and for much better speed in both the regular and the
satellite view. Today every frame of a pan or zoom repaints thousands of SVG paths, and satellite tiles are
reprojected pixel by pixel in JavaScript. The engine draws both on the GPU.

Read first, in this order:
- ${S}/work/globe/SPEC.md with its Addendum (the engine's API) and ${S}/work/globe/PROGRESS.md (what was
  built, deviations, additions such as anchorRadiusDeg and stats().imagery, known limits). The engine is
  ${S}/work/globe/globe.js (287 of 287 checks pass); ${S}/work/globe/site/index.html is a working example.
- ${S}/maps/map-port-checklist.md in full: every place the game touches the map, the per-mode setup, the
  subtle behaviours that must survive, and bugs B1-B10. It is your list of what "done" means. Its line
  numbers are from before the redesign; grep for the current code.

Decisions already made (do not reopen):
- Globe only: orthographic, north up, no flat map, no Albers insets for Alaska and Hawaii, no per-country
  conic projections. Without WebGL the engine's own Canvas 2D renderer is the fallback.
- The engine is pasted into the script as its own section between a banner and an END marker, byte for byte
  as in globe.js, the way the mastery module is; keep a check script that compares the two. If the engine
  itself needs a change, change globe.js, rerun its test file (NODE_PATH=/opt/node-tools/node_modules node
  test-globe.js, about 4 minutes; single groups with a filter argument), and paste again.
- Libraries are self-hosted: public/vendor/ has d3-array, d3-geo, topojson-client and earcut (min.js). Load
  those, and drop the cdnjs d3 and topojson script tags once nothing uses them (d3.zoom, d3.select,
  d3.geoPath and friends go away with the SVG map). The app must start with no network beyond its own origin
  and the fonts.
- World data: public/data/countries-110m.json for the first paint, then countries-50m.json for play (both
  are in the repo). US states and provinces keep their files.
- A layer's feature key is featureKey(f) ('name:' + the feature's raw name, from the logic stage). Marks are
  styles: never rebuild a layer to recolour a place.
- Colours come from the --g-* tokens and follow the theme when it changes.
- Satellite: the engine's setImagery with the Esri World Imagery tile address the app uses today, the Esri
  credit visible whenever imagery shows, "Loading imagery…" driven by the status callback. When
  supportsImagery() is false (Canvas 2D), the Satellite option and Uncharted are shown as unavailable with a
  short reason instead of failing.
- Nothing that floats over the map uses backdrop-filter.

Milestones, in order. Commit and push after each one. Every commit leaves every mode playable: while you move
modes over, the old renderer may stay for the ones not yet moved, and it is deleted when the last has moved.
M1 Engine in the page. World, the six continents and the Daily Five on the globe: layers, taps and clicks,
   hover, marks (found / second try / missed), the wrong-answer flash, reveal, Hard (no marks kept), zoom
   buttons and keys, recentre, each level's framing (fitTo after the first prompt has laid out), review mode
   ("View on the map"). The smoke suite's map adapter rewritten for the globe: expose the engine on
   window.__atlas as globe, aim real clicks with project() at a place's anchor, and turn or zoom the globe
   when the place is hidden or tiny.
M2 United States (states, both capital modes, city dots) and the province rounds, including Learn: study
   labels placed with the engine's anchor and anchorRadiusDeg, placed again when a zoom settles, and the
   "Zoom in to see every name" pill.
M3 Satellite and Uncharted in every mode through setImagery. Pin the City: aim, Drop Pin, the distance line
   and rings on the overlay, its framing on the cities' bounding box, and its Hard and Uncharted variants.
M4 Remove what the globe replaced: the SVG renderer, d3.zoom, the projection code, the CPU satellite canvas
   and its tile cache, their CSS, the CDN script tags. Then the edges: first paint on 110m with the swap to
   50m, a resize and a phone rotation, reduced motion, a lost WebGL context, and a full round played with
   forceCanvas2D.
M5 Measure and report: milliseconds of script per frame while turning and zooming the 50m world, with and
   without imagery, at desktop and phone size (the engine's stats()); time from navigation to an interactive
   map; and the same for the old app (git commit 1c74e1d) on the same machine. This sandbox renders WebGL in
   software, so say plainly what the numbers do and do not show.

How the rounds work: this stage is long, so it is run as a short series of engineers. Do the earliest
unfinished milestones. When you have finished and pushed one or two of them and your context is getting long,
stop: bring progress.md up to date and return with done = false. A fresh engineer continues from progress.md.
Return done = true only when every milestone is finished, the smoke suite passes on desktop and with
--mobile, and you have looked at the screenshots.

Screenshots to take and look at (${S}/shots/app/globe/): each kind of level mid-round at desktop and phone
size, light and dark, chart and satellite; Uncharted; Pin the City before and after a drop; Learn study and
quiz; review mode; the Canvas 2D fallback.
`
const GLOBE_SCHEMA = {
  type: 'object',
  properties: Object.assign({}, STAGE_SCHEMA.properties, {
    done: { type: 'boolean', description: 'true only when every milestone is finished and verified' },
    milestonesDone: { type: 'array', items: { type: 'string' }, description: 'Milestones finished so far, e.g. ["M1", "M2"]' },
  }),
  required: STAGE_SCHEMA.required.concat(['done', 'milestonesDone']),
}
// At most four rounds, and the rounds stop if one of them adds no commit.
const MAX_GLOBE_ROUNDS = 4
const globeRounds = (PIN.globeRounds || []).slice()
globeRounds.forEach((g, i) => done.push(Object.assign({ stage: 'Globe swap, round ' + (i + 1) }, g)))
let globeDone = globeRounds.some(g => g.done)
let lastGlobeCommit = globeRounds.length ? globeRounds[globeRounds.length - 1].commit : game.commit
const firstLiveGlobeRound = globeRounds.length + 1
for (let round = firstLiveGlobeRound; round <= MAX_GLOBE_ROUNDS && !globeDone; round++) {
  const g = await agent(COMMON2 + notes(done) + globeBrief + `\nThis is round ${round} of at most ${MAX_GLOBE_ROUNDS}.\n` +
    (round === firstLiveGlobeRound ? resumeNote(RESUME.globe) : ''),
    { label: 'globe-swap-' + round, phase: 'Globe', schema: GLOBE_SCHEMA })
  if (!g) throw new Error('globe round ' + round + ' returned nothing')
  globeRounds.push(g)
  done.push(Object.assign({ stage: 'Globe swap, round ' + round }, g))
  log('Globe round ' + round + ': ' + (g.commit || 'no commit') + (g.done ? ' (finished)' : ''))
  globeDone = g.done
  if (!globeDone && g.commit === lastGlobeCommit) {
    log('Globe round ' + round + ' added no commit; stopping the rounds')
    break
  }
  lastGlobeCommit = g.commit
}

// The review runs only when asked for, so the orchestrator can look at the result first.
if (!(args && args.review)) return { stages: done, globeFinished: globeDone, stoppedAfter: 'Globe' }

// ---------- Review ----------
phase('Review')
const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          severity: { type: 'string', enum: ['blocker', 'major', 'minor'] },
          where: { type: 'string', description: 'Screen / function / line or selector' },
          evidence: { type: 'string', description: 'Exact reproduction steps or code reference, and what was observed (screenshot path if visual)' },
          suggestedFix: { type: 'string' },
        },
        required: ['title', 'severity', 'where', 'evidence'],
      },
    },
    checked: { type: 'string', description: 'What was checked and found fine' },
  },
  required: ['findings', 'checked'],
}
const reviewBase = `
You are reviewing a large change to a geography quiz web app: ${REPO}/public/index.html (one file: CSS,
markup, one script) was restructured — a learning-history module and level registry were added and every
screen was redesigned. Read ${S}/BRIEF.md and ${S}/work/integration/PLAN.md (the target). The change is the
last four commits in ${REPO} (git log, git diff HEAD~4). Do NOT edit anything in the repo: you report
findings, another agent fixes them. Use ${S}/harness/atlas-harness.js to drive the real app (see BRIEF.md),
${S}/harness/smoke.js as a starting point, and ${S}/harness/seed-rich.js (if present) for a player with
history. Only report what you have actually reproduced or can point to in the code; give exact steps or
references. Do not report matters of taste, or anything PLAN.md says belongs to a later stage (the WebGL
globe, Explore, capitals/flags/typed modes). Save any screenshots under ${S}/shots/app/review/.
` + notes(done)

const lenses = [
  { key: 'function', prompt: reviewBase + `
YOUR LENS: does everything still work, and is progress safe? Play every mode and flow for real (each level
type, the three difficulties, satellite, Daily Five including the already-played state and day rollover with
a faked clock, focus practice, Smart Review playlists, Learn ladders, Pin the City, review-on-map, share,
deep links valid and invalid, back/forward and hash navigation, leaving mid-round, resize and rotation
mid-round). Returning players: seed stores in the OLD shapes (${S}/maps/ui-inventory.md section 4) and check
nothing is dropped, renamed or misread, and that every stored key written after play matches what the old
app would have written (compare against git show HEAD~4:public/index.html behaviour where needed). Sync:
simulate two devices against a stubbed /api/records (merge, reset propagation, 413, offline). Mastery:
outcomes recorded once per question with the right skill and name, never in Learn quizzes, sessions counted
once, due counts on Home match the store. Storage blocked or full (localStorage throwing) must not break
play. Check the test hook and the smoke suite still pass.` },
  { key: 'visual', prompt: reviewBase + `
YOUR LENS: visual and interaction quality against the chosen design. Screenshot every screen and state at
1280x800, 1440x900, 1024x768, 768x1024, 390x844 and 360x640, in both themes, for a new player and a rich
seeded player, and LOOK at each one. Compare with the mockup screenshots in ${S}/shots/design/a/. Report:
overflow, clipping, overlap, misalignment, truncated or wrapping text, wrong or hardcoded colours in dark
theme, low contrast (measure it), inconsistent spacing or type, unstyled leftovers of the old look, layout
shift when data arrives or fonts load (test with fonts blocked too), states that look broken (empty, loading,
error, long names such as "Democratic Republic of the Congo", large numbers), touch targets under 44px on
phones, anything over the map that hides the place being asked for, animation that replays on re-render, and
any hover tooltip (title= attributes are banned by the owner).` },
  { key: 'quality', prompt: reviewBase + `
YOUR LENS: code quality, accessibility and performance. Read the diff and the resulting file. Report: dead
or duplicated code and CSS left behind, old and new implementations side by side, functions that no longer
have callers, selectors that match nothing, style violations against CLAUDE.md, comments that narrate the
change instead of describing the code, storage or sync logic that can lose data (trace the merge and reset
rules by hand), event listeners added on every render, unbounded growth of any store, render paths that
rebuild the whole library on every small change, layout thrash, work done at startup that could wait.
Accessibility: keyboard reachability and visible focus on every control, focus trap and return for the
sheet and dialogs, Escape handling, landmarks and headings, names for icon buttons, live-region
announcements for answers and results (inventory section 9 lists what existed), reduced-motion, contrast of
text and of meaningful non-text marks in both themes, colour never the only signal. Measure load: script
parse + first render time and total transferred bytes through the harness, before (git stash or a copy of
HEAD~4) and after.` },
]
const reviews = await parallel(lenses.map(l => () =>
  agent(l.prompt, { label: 'review:' + l.key, phase: 'Review', schema: FINDINGS })
    .then(r => r ? { lens: l.key, findings: r.findings || [], checked: r.checked } : null)))
const all = reviews.filter(Boolean).flatMap(r => r.findings.map(f => Object.assign({ lens: r.lens }, f)))
log('Review findings: ' + all.length + ' (' + all.filter(f => f.severity === 'blocker').length + ' blockers, ' + all.filter(f => f.severity === 'major').length + ' major)')

// ---------- Fix ----------
phase('Fix')
const fixPrompt = COMMON2 + notes(done) + `
YOUR STAGE: fix the findings of three independent reviewers (function, visual, quality). For each finding
below: reproduce it or confirm it in the code first. If it is real, fix it properly (root cause, not a
patch over the symptom) and re-check. If you cannot reproduce it or it is wrong, say so with your evidence
and leave the code alone. Work through blockers, then major, then minor; fix all of them unless a fix
belongs to a later stage named in PLAN.md (the globe, Explore, capitals/flags/typed modes) — then record it.
After the fixes: node --check, the full smoke suite at desktop and with --mobile, and a fresh look at
screenshots of every screen you touched in both themes. Commit as one commit.

Findings (JSON):
${JSON.stringify(all, null, 1)}

Return in your summary a line per finding: fixed / not reproduced / deferred, with one phrase of evidence.
`
const fix = await agent(fixPrompt, { label: 'fix-findings', phase: 'Fix', schema: STAGE_SCHEMA })
if (fix) done.push(Object.assign({ stage: 'Fixes' }, fix))

return { stages: done, findings: all, reviewChecked: reviews.filter(Boolean).map(r => ({ lens: r.lens, checked: r.checked })) }
