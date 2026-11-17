export const meta = {
  name: 'atlas-learning',
  description: 'New ways to learn (capitals, flags, typed answers, Explore, Learn everywhere), then polish, performance and docs',
  phases: [
    { title: 'Quiz', detail: 'quiz logic module with exhaustive tests, outside the repo' },
    { title: 'Modes', detail: 'Capitals, Flags and Name It in the app' },
    { title: 'Explore', detail: 'Explore view with place cards and the mastery globe; Learn for more levels' },
    { title: 'Polish', detail: 'performance, accessibility, visual polish, docs' },
  ],
}

const S = '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad'
const REPO = '/home/user/atlas-game'
const BRANCH = 'claude/determined-hamilton-w2lcbm'

// Finished results handed in by the orchestrator, so a restart never runs a finished stage again.
const PIN = (args && args.pinned) || {}
// What an interrupted attempt at a stage left behind, written by the orchestrator at relaunch.
const RESUME = (args && args.resumeNotes) || {}
const resumeNote = t => t ? '\nWHERE THE ATTEMPT BEFORE YOURS STOPPED (written by the orchestrator):\n' + t + '\n' : ''
// Stop after this stage (quiz, modes, explore or polish); default runs all four.
const LAST = (args && args.last) || 'polish'

const STAGE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'What was built and how it was verified' },
    commit: { type: 'string', description: 'Hash of the last commit of this stage, or empty if nothing was committed' },
    checks: { type: 'string', description: 'Checks run and their results (syntax, suites with numbers, screenshots looked at)' },
    notDone: { type: 'array', items: { type: 'string' }, description: 'Anything from the stage brief that is not done or not verified' },
    notesForNextStage: { type: 'array', items: { type: 'string' }, description: 'New functions, ids, hooks and traps the next stages must know' },
  },
  required: ['summary', 'commit', 'checks', 'notDone', 'notesForNextStage'],
}

function notes(prev) {
  const out = []
  prev.filter(Boolean).forEach(p => {
    out.push('--- ' + p.stage + ' (commit ' + (p.commit || 'none') + ') ---')
    out.push(p.summary)
    if (p.notDone && p.notDone.length) out.push('Not done / not verified: ' + p.notDone.join(' | '))
    if (p.notesForNextStage && p.notesForNextStage.length) out.push('Notes: ' + p.notesForNextStage.join(' | '))
  })
  return out.length ? '\nReports from the stages of this run before yours:\n' + out.join('\n') + '\n' : ''
}

const COMMON = `
You are one stage of a multi-stage overhaul of a geography quiz web app: repo ${REPO}, branch ${BRANCH}.
The app is ONE file, ${REPO}/public/index.html (CSS, markup, one IIFE script; large, because a WebGL globe
engine and a learning-history module are pasted into it), plus self-hosted libraries in public/vendor/ and
map data in public/data/. No build step, no framework. CLAUDE.md in the repo is partly out of date about
the app (it still describes the old flat map and menus); its rules about style and what not to build stand.

Read first, once: ${S}/BRIEF.md (context and the test harness), ${S}/work/integration/PLAN.md (the product
plan), and in ${S}/work/integration/progress.md the sections written by the stages before you. progress.md
is the record of what exists now: the level registry (LEVELS, COLLECTIONS), the mastery module, Home and
the level sheet, Stats, Settings, the game HUD and results (renderResults), and the globe (the map object,
its per-round calls, the overlay, the test tools and the traps). Earlier stages finished in this order:
logic layer; shell, Home and level sheet; Stats and Settings; game screen and results; the game on the
globe. Other agents are NOT editing the repo while you work.

Working rules:
- Extend the existing file; do not rebuild, and add no files to the repo other than the ones your stage
  names. Match the code style in CLAUDE.md (semicolons, 2-space indent, // comments, /* ===== Section =====
  */ dividers, a one-line comment above non-obvious functions, CSS custom properties for colour, never a
  hardcoded colour where a token exists). Comments describe what the code does or why, never the history
  of the change. Use the design system that is there (tokens, components, type scale); new screens and
  pieces must look like they were always part of it, in both themes (Parchment and Night Chart).
- Owner rules: no hint buttons, no hover tooltips (no title= attributes; use aria-label), no public
  leaderboards, nothing about live multiplayer, do not regenerate favicons or the OG image.
- Some sections of the script are pasted byte for byte from source files and guarded by paste checks (the
  mastery module, the globe engine). Never edit those in place: change the source file, rerun its own tests,
  paste again, rerun the paste check.
- Storage keys are display labels in places (PLAN.md section 5). Never change what existing levels write to
  or read from atlas-records, atlas-focus, atlas-pin, atlas-learn, atlas-daily-attempts or atlas-mastery.
  localStorage is the source of truth; sync mirrors it; the app keeps working when sync is unreachable.
- Delete code and CSS your work makes dead. No old and new versions side by side.
- Verify as you go: node --check on the extracted script blocks; drive the real app through
  ${S}/harness/atlas-harness.js and LOOK at screenshots of what you built with the Read tool (desktop
  1280x800 and phone 390x844, both themes). A visual feature is not done until you have looked at it. Fix
  what you see. Playwright scripts over the map need --disable-gpu-compositing (the existing tools patch
  chromium.launch for it); wait for a view or state to arrive instead of sleeping a fixed time.
- Before finishing, run every suite on the final tree and fix real failures in the app: harness/smoke.js
  (desktop and --mobile), work/integration/shell/check-shell.js, pages/check-stats.js,
  pages/check-settings.js, game/check-game.js, globe-stage/check-globe.js, logic-tests/run-all.sh and the
  paste checks (all under ${S}; run with NODE_PATH=/opt/node-tools/node_modules). The seed files are dated:
  after a UTC day change regenerate them as progress.md describes. If a failure is a suite being out of
  date with an intended change, update its adapter or expectation and say so in your report. Never weaken a
  check to hide a bug. Add checks for what you build to a suite of your own in ${S}/work/integration/.
- Do not edit public/index.html while a suite is running; the harness serves it live.
- Commit each coherent piece as you finish it (several commits per stage are fine), with a plain message
  that says what changed, and push after each commit so an interruption cannot lose it:
  git push -u origin ${BRANCH} (on a network error retry up to 4 times, waiting 2, 4, 8, 16 seconds). That
  branch only. Never force-push, never open a pull request, never touch main. Leave the wip/ folder alone.
- The orchestrator sometimes commits a checkpoint of the working tree while you work. git commit may then
  report nothing to commit; check git log before assuming your work is uncommitted, and carry on.
- INTERRUPTIONS: this work can be cut off at any moment by a usage limit, and a fresh agent with no memory
  is then given this same brief. So FIRST look at progress.md, git log, git status and git diff: if an
  earlier attempt at YOUR stage left work behind, continue from it instead of starting over (check its
  claims rather than trusting them). Keep progress.md current as you work: a section for your stage listing
  what is done and verified, what is in progress, what remains, and anything a successor must know. Keep
  public/index.html in a working, syntax-valid state at every save point.
- ECONOMY: the usage allowance for this work is tight. Spend it on building and checking, not on re-reading:
  read the plan and notes once; work on index.html with Grep and ranged Reads, never by reading the whole
  file; send long command output to a file and grep it; look at the screenshots that matter, not every one.
- Be honest in your report: what is done, what you verified and how, what is not done or not verified.
  Real Esri imagery, the live site, Safari, Firefox and real touch devices cannot be reached from here; never
  claim they were tested.
`

const done = []

// ---------- Quiz ----------
phase('Quiz')
const quizPrompt = `
Read ${S}/BRIEF.md (context and the test harness), then ${S}/work/quiz/SPEC.md, and build exactly what the
spec asks for in ${S}/work/quiz/. Read the data files it names in full first (${S}/work/data/world-facts.js,
its notes.md, game-countries.json). Do not edit anything under ${REPO} in this stage.

The module will be pasted byte for byte into a browser script and guarded by a paste check, so give
quiz.js a banner comment as its first line and an END marker comment as its last line, and make it load in
node as well (module.exports when module exists) so the tests need no browser.

Run your tests and the flag check, look at the flag contact sheet, and iterate until everything passes for
real. The tests are the only review this module gets before it meets the app, so be your own adversary:
besides the exhaustive checks the spec lists, try the inputs a real player types. Confusable pairs (Niger /
Nigeria, the Guineas, the two Congos, Dominica / Dominican Republic, Austria / Australia, Iran / Iraq,
Slovakia / Slovenia, Gambia / Zambia, Mali / Malawi / Malta, Sudan / South Sudan, the Koreas, Ireland /
Iceland, Latvia / Lithuania, Libya / Liberia, Mauritius / Mauritania, Paraguay / Uruguay, India /
Indonesia, Chad / Chile / China), a child's phonetic spellings, keyboard slips, pasted text with odd
whitespace, Unicode look-alikes, right-to-left marks, emoji, very long input, and keys such as __proto__
and constructor. A near match must never resolve to a different country than the one a reasonable person
meant; when in doubt the matcher answers nothing. Print the worst accepted near-misses and judge them.
Brute-force capitalChoices over every country, several pools (its continent, the world, pools of 1 to 3
countries, pools with unknown names) and many seeds: no rule violation, duplicate, missing answer, skewed
answer position, endless loop or crash. Measure the per-call cost of the matcher on 250 entries.

INTERRUPTIONS: this work can be cut off at any moment by a usage limit, and a fresh agent with no memory is
then given this same brief. So first check what already exists in ${S}/work/quiz/ (quiz.js, test-quiz.js,
PROGRESS.md) and continue from it, checking its claims. Keep ${S}/work/quiz/PROGRESS.md current (done and
verified, in progress, remaining) and keep quiz.js runnable at every save.
ECONOMY: the usage allowance is tight; do not re-read files you have read, and send long output to a file.

Return: the files; the test results with numbers; every departure from the spec with the reason; every
problem you found in the DATA (ambiguous spellings, capitals that break the choice rules, flags with no
glyph); and what the app must do to use the module (the API as built).
`
const QUIZ_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    checks: { type: 'string', description: 'Test results with numbers' },
    dataProblems: { type: 'array', items: { type: 'string' } },
    api: { type: 'string', description: 'The API as built and what the app must do to use it' },
    notDone: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'checks', 'dataProblems', 'api', 'notDone'],
}
const quiz = PIN.quiz || await agent(quizPrompt + resumeNote(RESUME.quiz), { label: 'quiz-module', phase: 'Quiz', schema: QUIZ_SCHEMA })
if (!quiz) throw new Error('quiz stage returned nothing')
log('Quiz module: ' + String(quiz.checks).slice(0, 160))
const quizNote = `
The quiz logic module (${S}/work/quiz/quiz.js, tests in test-quiz.js, notes in NOTES.md) was built and
tested outside the repo by the stage before yours. Its report:
${quiz.summary}
Tests: ${quiz.checks}
API: ${quiz.api}
Problems found in the data: ${(quiz.dataProblems || []).join(' | ') || 'none'}
Not done: ${(quiz.notDone || []).join(' | ') || 'nothing'}
`
if (LAST === 'quiz') return { quiz, stoppedAfter: 'Quiz' }

// ---------- Modes ----------
phase('Modes')
const modesPrompt = COMMON + quizNote + `
YOUR STAGE: three new ways to learn the world's countries, built on the quiz module and the globe.

Bring in the pieces:
- Paste ${S}/work/quiz/quiz.js into the script as its own section, byte for byte between its banner and END
  marker, and add a paste check next to the existing ones (logic-tests/check-mastery-paste.js is the model).
- Paste the data from ${S}/work/data/world-facts.js (WORLD_FACTS and COUNTRY_TYPED_ALIASES, with the header
  comment that states its rules) as its own section. Every key must be a canonical country name the game
  uses; check that at load in the test suite, not at run time.
- Copy ${S}/work/quiz/pkg/x/package/dist/TwemojiCountryFlags.woff2 to public/vendor/ and declare the font
  as the spec says. Load it only when a flag is about to be shown, not at startup. Credit it in Settings,
  About, next to the existing credits: the font comes from the npm package country-flag-emoji-polyfill
  (check the licence file in ${S}/work/quiz/pkg/ and quote it correctly) and the artwork is Twemoji,
  CC-BY 4.0.

New levels, all for The World and the six continents (seven levels each), added to LEVELS and COLLECTIONS
so that Home, the level sheet, Stats, Smart Review, level links and the test hook pick them up from the
registry:
1. Capitals, pick: the globe turns to the country and marks it as the prompted place; the card asks for
   its capital; four choices from Quiz.capitalChoices (the same-continent pool; the world for World). Reuse
   the choices panel of States to Capitals.
2. Capitals, find: the card names a capital; the player taps its country on the globe. Leave out the
   countries Quiz flags as trivial.
3. Flags: the card shows a flag, large; the player taps its country on the globe. Leave out countries with
   no glyph (flags-missing.json). When Quiz.flagSupport says none, the flag levels show as unavailable with
   a short reason, the way the three unavailable city levels do.
4. Name It: the globe turns to a country and marks it; the player types its name into a field in the
   prompt card and presses Enter (a submit button too). Use Quiz.matcher built once per round with
   restrictTo set to the round's countries. An exact or alias match is right. A near match is right and
   the toast shows the correct spelling. An outside match says it is a real country but not this one and
   counts as a wrong try. No autocomplete and no suggestions: that would be a hint. On phones the
   on-screen keyboard must not cover the marked country: follow window.visualViewport so the stage and its
   clear area shrink to what is visible, and keep the field focused between questions so the keyboard does
   not bounce. The S key must type an s in the field, not skip; give Skip another route while the field
   has focus.
Scoring, second tries, reveal on a miss, the three difficulties, records, focus practice, the results
screen and share text all work as they do for the existing modes; decide what Hard and Uncharted mean for
each new mode so that they stay honest (in Uncharted a country's shape is normally hidden until it is
answered; Name It and Capitals pick must still show the place being asked), and write the rule down in the
level sheet's difficulty descriptions if it differs.

In the Library: three new collections after Provinces and States, in this order: Capitals, Flags, Name
It, each with an icon tile and a one-line description. Capitals holds fourteen levels but shows seven
cards: its header carries a two-way switch (Pick the capital / Find the country) that chooses which seven
are shown, remembered per device. Give LEVELS entries an optional variant for this; every level still has
its own key, slug, game mode and records, and Stats lists all of them. Slugs: capitals-europe,
capitals-find-europe, flags-europe, name-europe, and the same with world and the other continents.
New game modes in GAME_MODES and their records regions follow the existing pattern (region = the continent
name, or World).

Mastery: three new skills, item = the canonical country name: capital (fed by both capitals modes), flag,
and country-name (typed). Record outcomes by the existing rules. Smart Review hosts: capital goes to World
capitals pick, flag to World flags, country-name to World Name It, each as a practice round with exactly
the due names. Home's "places mastered" total and the Stats mastery panel must count the new skills
sensibly: say in your report how the totals changed and why. Measure the size of the sync payload for a
heavy player with every skill filled (extend harness/seed-rich.js) against the 256 KB limit in
functions/api/records.js and report the number; if it passes 200 KB, say so and propose the smallest fix.

Screenshots to take and look at (${S}/shots/app/modes/), desktop and phone, both themes: each new mode in
play (a right answer, a wrong one, a reveal), Name It with the phone keyboard area simulated by a reduced
visualViewport, the Capitals collection in both switch positions, a level sheet for each new kind, results
for each new kind, Stats with the new skills, and a flag level shown as unavailable.
`
const modes = PIN.modes || await agent(modesPrompt + resumeNote(RESUME.modes), { label: 'new-modes', phase: 'Modes', schema: STAGE_SCHEMA })
if (!modes) throw new Error('modes stage returned nothing')
done.push(Object.assign({ stage: 'Capitals, Flags, Name It' }, modes))
log('Modes: ' + (modes.commit || 'no commit'))
if (LAST === 'modes') return { quiz, stages: done, stoppedAfter: 'Modes' }

// ---------- Explore ----------
phase('Explore')
const explorePrompt = COMMON + notes(done) + `
YOUR STAGE: the Explore view, and Learn for more levels.

Explore (PLAN.md section 2 reserves #explore-screen, the #explore hash and a VIEWS entry for it): a fourth
top-level view, between Home and Stats in the navigation (desktop top nav, phone bottom bar).
- A full-bleed globe of the world's countries that the player can turn and zoom freely, with the map style
  control (Chart / Satellite). Use the one engine instance the game already has (move its host between
  screens, or whatever the code makes cleanest); never hold two WebGL contexts.
- Tapping a country selects it and opens a place card (a side panel on desktop, a bottom sheet on phones
  that leaves the selected country visible): its flag, name, capital with any other capitals the data
  lists, continent, the countries it borders (chips that fly to that neighbour and select it), and where
  the player stands with it: one line per skill (find on the globe, name it, capital, flag) with the
  mastery state and when it was last seen, or "Not seen yet". A button opens the level sheet for its
  continent. Neighbours come from the world map's own topology (shared borders in the data that is
  loaded); check the result by hand for a sample of twenty countries, including France (it borders Brazil
  and Suriname through French Guiana) and the island countries (none), and fix or leave out anything the
  data gets wrong. Show only facts that come from the verified data files; do not add figures such as area
  or population from memory.
- A search field that finds a country by name as you type (accent- and case-insensitive through Quiz.fold,
  aliases included) and flies to it. Explore is not a quiz, so suggestions are fine here.
- A "Colour by" control: Plain, or the player's mastery for one skill (Find, Name, Capital, Flag). Mastery
  colours are the four steps of the moss ramp (--m0 to --m3) as engine styles, with a legend that gives the
  count in each step. Over satellite imagery keep it legible or switch the control off with a reason.
- Stats links here: a "See it on the globe" action in the mastery panel that opens Explore coloured by that
  skill. Deep link: #explore, and #explore=<country slug> selects a country.
- Keyboard: the search field is reachable, Escape closes the card, arrow keys and plus / minus drive the
  globe as they do in the game. Screen readers get the selected country's card as a live region.
- Leaving Explore for a game and coming back must leave both working (layers, styles, hover, imagery).

Learn for more levels: the Learn ladder exists for province levels. Offer it in the level sheet for the
six continent levels (countries) and for States as well, with the same rules, names drawn on the globe
from the engine's anchors, progress in atlas-learn keyed by the level key. Not for The World (184 names is
too long a ladder). Practice only, as today: no records, no focus list, mastery not recorded per item.

Screenshots to take and look at (${S}/shots/app/explore/), desktop and phone, both themes: Explore with
nothing selected, a country selected (a large one, a small island, one with many neighbours), search with
results, each colour-by setting for a seeded player, satellite, the Stats link arriving, and Learn on a
continent (study and quiz) at both sizes.
`
const explore = PIN.explore || await agent(explorePrompt + resumeNote(RESUME.explore), { label: 'explore-learn', phase: 'Explore', schema: STAGE_SCHEMA })
if (!explore) throw new Error('explore stage returned nothing')
done.push(Object.assign({ stage: 'Explore and Learn' }, explore))
log('Explore: ' + (explore.commit || 'no commit'))
if (LAST === 'explore') return { quiz, stages: done, stoppedAfter: 'Explore' }

// ---------- Polish ----------
phase('Polish')
const polishPrompt = COMMON + notes(done) + `
YOUR STAGE: performance, accessibility, visual polish and the docs. Read
${S}/work/integration/orchestrator-notes.md first: it lists defects seen in screenshots that you must fix.
Then read the "not done" lists of every stage in progress.md and close what is still open and in scope.

Performance (the owner asked for a fast app in both chart and satellite modes):
- Measure first, on the final tree and on the old app (git show 1c74e1d:public/index.html served the same
  way; ${S}/bench/ has earlier numbers and tools): bytes transferred and requests on a cold load, time to
  the first usable screen, time from tapping Start to the first question, frame time while turning and
  zooming the globe on chart and on satellite (mock tiles) at desktop and phone size, memory after ten
  rounds. If the globe stage already measured some of this, reuse its method and fill the gaps.
- Then fix what the numbers show. Candidates: anything loaded at startup that only one mode needs (flag
  font, province data, US data, the 50m world file before a round needs it); the US states file if it is
  still a large GeoJSON (${S}/us-states-topo-1000000.json is a TopoJSON trial at 1e6 quantization; check
  that every state survives and borders still meet before adopting it); work repeated on every frame or
  every render; listeners added on every render; timers left running on hidden screens; font loading
  (preconnect, display swap, no layout shift when the fonts arrive).
- Report before and after numbers in a small table. Do not add a service worker.

Accessibility: every control reachable by keyboard with a visible focus ring in both themes; dialogs and
sheets trap focus and return it; Escape works everywhere it should; icon buttons have names; answers,
reveals and results are announced through a live region; the in-app Reduce motion switch and the OS
setting both stop globe fly-to animation, inertia and pulses (the engine reads only the OS setting today:
add an engine option, rerun its tests, paste again); contrast of text and of meaningful marks in both
themes (measure; fix failures by adjusting tokens, not one-off colours); colour is never the only signal.

Visual polish: go through every screen at 1280x800, 1024x768, 768x1024, 390x844 and 360x640 in both themes
for a new player and a seeded one, look at each, and fix overflow, clipping, overlap, truncation, uneven
spacing, leftovers of the old look, and anything over the globe that hides the place being asked.

Housekeeping: remove dead code, CSS, unused tokens and unused files under public/ (check that nothing
references a file before deleting it; do not touch favicons or the OG image); add a short README in
public/vendor/ listing each vendored file with its version, source and licence. Move the pasted modules'
tests into the repo as orchestrator-notes.md describes (tools/tests/, loading each module out of
public/index.html), so that nothing the repo needs lives only in the scratchpad.

Docs, last: rewrite the parts of ${REPO}/CLAUDE.md and ${REPO}/atlas_handoff.md that describe the app so
they match what is there now (views and navigation, LEVELS and COLLECTIONS, mastery and Smart Review, the
globe engine and how the game drives it, imagery, the new modes and the quiz module, Explore, Learn, the
stores and the sync payload with its 256 KB limit, deep links, the pasted modules and their paste checks,
how to run the app locally). Keep CLAUDE.md's existing voice, its owner rules, deploy and gotcha sections;
change facts, not policy. Do not describe the scratch test suites as part of the repo.
`
const polish = PIN.polish || await agent(polishPrompt + resumeNote(RESUME.polish), { label: 'polish-perf-docs', phase: 'Polish', schema: STAGE_SCHEMA })
if (!polish) throw new Error('polish stage returned nothing')
done.push(Object.assign({ stage: 'Polish, performance, docs' }, polish))
log('Polish: ' + (polish.commit || 'no commit'))

return { quiz, stages: done, stoppedAfter: 'Polish' }
