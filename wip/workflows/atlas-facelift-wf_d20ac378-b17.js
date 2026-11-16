export const meta = {
  name: 'atlas-facelift',
  description: 'Logic layer (mastery, level registry), then the facelift of every screen in public/index.html, then review and fixes',
  phases: [
    { title: 'Logic', detail: 'mastery module, LEVELS registry, recording, sync, test hook; smoke suite in parallel' },
    { title: 'Shell', detail: 'design system, themes, app shell, Home, level sheet' },
    { title: 'Pages', detail: 'Stats and Settings' },
    { title: 'Game', detail: 'game HUD and results screen' },
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
const shell = await agent(shellPrompt, { label: 'shell-home-sheet', phase: 'Shell', schema: STAGE_SCHEMA })
if (!shell) throw new Error('shell stage returned nothing')
done.push(Object.assign({ stage: 'Shell, Home, level sheet' }, shell))
log('Shell: ' + (shell.commit || 'no commit'))

// ---------- Pages ----------
phase('Pages')
const pagesPrompt = COMMON2 + notes(done) + `
YOUR STAGE: the Stats and Settings pages (PLAN.md section 2, "Stats" and "Settings"), on the shell and
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
const pages = await agent(pagesPrompt, { label: 'stats-settings', phase: 'Pages', schema: STAGE_SCHEMA })
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
const game = await agent(gamePrompt, { label: 'game-results', phase: 'Game', schema: STAGE_SCHEMA })
if (!game) throw new Error('game stage returned nothing')
done.push(Object.assign({ stage: 'Game HUD and results' }, game))
log('Game: ' + (game.commit || 'no commit'))

// The review runs only when asked for, so the orchestrator can look at the three stages first.
if (!(args && args.review)) return { stages: done, stoppedAfter: 'Game' }

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
