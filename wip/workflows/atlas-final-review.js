export const meta = {
  name: 'atlas-final-review',
  description: 'Independent reviews of the finished app (play and progress, the globe), then fixes with a regression check for each',
  phases: [
    { title: 'Review', detail: 'two reviewers, one after another: play and progress, then the globe' },
    { title: 'Fix', detail: 'reproduce and fix confirmed findings, each with a check that would catch it again' },
    { title: 'Verify', detail: 'only in a full run: independent re-check of every fix' },
  ],
}

const S = '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad'
const REPO = '/home/user/atlas-game'
const BRANCH = 'claude/determined-hamilton-w2lcbm'
const BASE = '1c74e1d'   // the app before the overhaul

// Finished results handed in by the orchestrator, so a restart never runs a finished stage again.
const PIN = (args && args.pinned) || {}
const PIN_REVIEWS = PIN.reviews || {}
// What an interrupted attempt at a stage left behind, written by the orchestrator at relaunch.
const RESUME = (args && args.resumeNotes) || {}
const resumeNote = t => t ? '\nWHERE THE ATTEMPT BEFORE YOURS STOPPED (written by the orchestrator):\n' + t + '\n' : ''
// The owner chose the lean review: two reviewers, and the orchestrator re-checks the fixes from the suites.
// args.reviewers names other lenses to run (learning, craft); args.full adds the Verify phase.
const WANT = (args && args.reviewers) || ['play', 'globe']
const FULL = !!(args && args.full)

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
          where: { type: 'string', description: 'Screen, function, selector or data entry' },
          evidence: { type: 'string', description: 'Exact reproduction steps or code reference, and what was observed (screenshot path if visual)' },
          suggestedFix: { type: 'string' },
        },
        required: ['title', 'severity', 'where', 'evidence'],
      },
    },
    checked: { type: 'string', description: 'What was checked and found fine' },
    notChecked: { type: 'string', description: 'What the lens asked for that was not checked, and why' },
  },
  required: ['findings', 'checked', 'notChecked'],
}

const reviewBase = key => `
You are an independent reviewer of a finished overhaul of a geography quiz web app: repo ${REPO},
branch ${BRANCH}. The app is ONE file, ${REPO}/public/index.html (CSS, markup, one IIFE script with a WebGL
globe engine, a learning-history module and a quiz logic module pasted in), plus public/vendor/ and
public/data/ and a small Pages Function, functions/api/records.js. The app before the overhaul is commit
${BASE} (git show ${BASE}:public/index.html); the overhaul turned a flat SVG map with a menu tree into a
globe with Home, Explore, Stats and Settings views, per-place mastery with Smart Review, and new modes
(world capitals, flags, typed answers, Learn for more levels).

Read once: ${S}/BRIEF.md (context and the test harness), ${S}/work/integration/PLAN.md (the product plan),
and skim ${S}/work/integration/progress.md (what each stage built, its test tools and its known warts).
CLAUDE.md in the repo states the owner's rules: no hint buttons, no hover tooltips (no title= attributes),
no public leaderboards, nothing about live multiplayer, one file with no build step, localStorage is the
source of truth and sync only mirrors it.

Rules for you:
- Do NOT edit anything in the repo. You report; another engineer fixes. Work in ${S}/work/review/${key}/.
- Drive the real app through ${S}/harness/atlas-harness.js; the stages' suites and tools named in
  progress.md are starting points, not proof. Playwright over the map needs --disable-gpu-compositing.
  ${S}/harness/seed-rich.js makes a player with history.
- Report only what you have reproduced or can point to in the code, with exact steps or references. No
  matters of taste. Do not report the known limits of this sandbox (no GPU, no real Esri tiles, no Safari,
  Firefox or real phones), or the wip/ folder, which is temporary.
- Severity: blocker = data loss, a mode that cannot be played, a wrong fact taught as right, or a crash;
  major = a visible defect or wrong behaviour a player will meet; minor = everything else worth fixing.
- Report at most 30 findings, the most serious first; if you had more, say how many and of what kind in
  notChecked.
- INTERRUPTIONS: this work can be cut off at any moment by a usage limit, and a fresh agent with no memory
  is then given this same brief. So write each finding to ${S}/work/review/${key}/findings.md the moment you
  have confirmed it, with its evidence, and keep a short list there of what you have covered. FIRST check
  whether that file exists and continue from it instead of starting over.
- ECONOMY: the usage allowance is tight. Read the plan and notes once; use Grep and ranged Reads on
  index.html, never the whole file; send long output to a file; look at the screenshots that matter.
`

const lenses = [
  { key: 'play', prompt: `
YOUR LENS: does everything work, and is a player's progress safe?
- Play every kind of level end to end for real: find a country (World, a continent), the three US modes, a
  US cities round, a province round, Pin the City, the Daily Five (unplayed, played, and day rollover with a
  faked clock), world capitals in both directions, flags, typed answers, focus practice, a Smart Review
  playlist to its end, Learn ladders (a province level, a continent, States), review on the map, share.
  Cover Normal, Hard and Uncharted, chart and satellite, desktop and phone, mouse, touch and keyboard.
- Leaving mid-round, starting another at once, the browser back button, hash navigation, level links valid
  and invalid, resize and rotation mid-round, a second tab open on the same data.
- Returning players: seed the stores in the OLD shapes (${S}/maps/ui-inventory.md section 4) and check that
  nothing is dropped, renamed or misread, and that what old levels write after play is what the old app
  would have written (compare behaviour with commit ${BASE}). Share text for the old modes must be byte for
  byte what the old app produced.
- Sync: two simulated devices against a stubbed /api/records: merge rules, reset reaching the other device,
  a 413, being offline, a corrupt or oversized blob, and the payload size for a heavy player against the
  256 KB limit. Trace the merge and reset code by hand for a way to lose progress.
- Mastery: each resolved question recorded once with the right skill and name, never in Learn quizzes;
  sessions counted once; due counts on Home, the Smart Review card and Stats agree with the store.
- localStorage throwing (blocked or full) must not break play.
- Facts, by script and not by eye (no other reviewer checks them): write ONE script that takes the app's
  own data from the page (window.__atlas and the WORLD FACTS section) and compares it with an independent
  published dataset from npm (the network reaches package registries; world-countries is one): every
  country's capital and accepted alternates, ISO code (and so its flag), continent, and the US state
  capitals. Where the two disagree, work out which is right and say how you know. Borders and names that
  are a deliberate choice (CLAUDE.md lists them) are not findings. Then, through the page's own Quiz
  module, check that every country's name and every typed alias resolves to that country and to no other
  in its level and in The World; a name accepted for the wrong country is a blocker. Type twenty of them
  through the real field as well, with a misspelling each, and check what is shown and recorded.
- The owner banned hints: is there anything that works as one? Suggestions while typing in Name It, a
  hover or focus state or an accessible name on the map that gives the asked place away, a label drawn
  before the answer, any title= attribute.` },
  { key: 'globe', prompt: `
YOUR LENS: the globe, in every mode. The engine source and its tests are in ${S}/work/globe/ (the app holds
a pasted copy); the game's side is the MAP section of index.html.
- Picking: every askable place in every level can be tapped at the level's opening view or after a
  reasonable zoom, on a phone as well: island states, microstates, enclaves, places split by the
  antimeridian (Russia, Fiji, Alaska's Aleutians), places near the poles, small US states, small provinces
  and territories, crowded city dots. Write a script that asks the app for every item of every level and
  taps its anchor; report every item that cannot be answered that way.
- Framing: for every level at 1280x800, 1024x768, 768x1024, 390x844 and 360x640, is the level's area in the
  part of the stage the HUD leaves clear, large enough to play, and is the prompted place brought into
  view? Is anything the player must see under the prompt card, toast, controls or tally?
- Marks, reveals, hover, Learn names, pins and miss lines after turning, zooming, resizing, a theme change,
  a map-style change and review on the map.
- Imagery with the mock tiles: seams, the antimeridian, the poles, loading and failed states, the credit
  line, Uncharted hiding and then showing shapes; the Canvas 2D fallback for a full round (gshot --nogl);
  a lost WebGL context mid-round; Reduce motion from the OS and from Settings.
- Resources: after twenty rounds across modes, do the engine's own counters (stats()) show textures,
  buffers, listeners or timers growing? Does anything keep drawing while a non-map screen is showing?
- Read the engine and the MAP section for errors the tests would not catch: precision at high zoom,
  antimeridian and pole handling, state shared between rounds, work repeated every frame.
- Measure what can be measured here (main-thread work per frame while turning and zooming, time from Start
  to the first question, time to first usable screen, bytes on a cold load) against commit ${BASE} with
  ${S}/work/integration/globe-stage/measure.js, and report any case where the new app is slower.` },
  { key: 'learning', prompt: `
YOUR LENS: is what the app teaches correct, and does it teach well?
- Facts. Check every fact the app can show or score against an independent source, not against the app's
  own data: world capitals and their accepted alternates, ISO codes and therefore flags, the list of
  countries per continent, US state capitals, the cities and coordinates of Pin the City and the US cities
  rounds, province and state names, and the neighbours shown in Explore. The network reaches package
  registries, so use published datasets from npm (for example world-countries, and a cities dataset) as the
  second source; where the two disagree, work out which is right and say how you know. Borders and names
  that are deliberately a choice (CLAUDE.md lists them) are not findings.
- Flags: render every flag level's flags through the harness and look at the contact sheet; a wrong,
  missing or outdated flag is a finding; so are two flags a player cannot tell apart that are not accepted
  for each other.
- Typed answers in the app, not only in the module: for every country type its name, each alias, common
  misspellings and the names of confusable countries, and check what the app accepts, what it shows, and
  what it records. A name accepted for the wrong country is a blocker.
- Capital choices in the app: over many rounds, no duplicate or near-duplicate options, never the asked
  country's other capital as a wrong option, the answer always present, positions not skewed.
- Learning logic: with a faked clock, walk items through the mastery states and check the schedule against
  ${S}/work/mastery/SPEC.md; check what Smart Review picks and in what order, that practice and Learn do
  not touch records, that the Learn ladder's rules hold (one miss restarts the level, a clean pass adds the
  next), and that the figures on Home, Stats and Explore's mastery colouring all agree with the store.
- Is there anything in the app that works as a hint (the owner banned them): suggestions while typing in a
  quiz, a hover or focus state that reveals the answer, a label drawn before the answer, an accessible
  name on the map that gives the place away?` },
  { key: 'craft', prompt: `
YOUR LENS: design quality, accessibility, code and docs.
- Take screenshots of every screen and state at 1280x800, 1024x768, 768x1024, 390x844 and 360x640, in both
  themes, for a new player and a seeded one, and LOOK at them: overflow, clipping, overlap, truncated or
  badly wrapping text (long names such as Democratic Republic of the Congo), uneven spacing or type, wrong
  or hardcoded colours in the dark theme, empty, loading and error states that look broken, layout shift
  when data or fonts arrive (try with fonts blocked), animation that replays on every re-render, leftovers
  of the old look, and any title= attribute.
- Accessibility: every control reachable by keyboard with a visible focus ring in both themes; dialogs and
  sheets trap and return focus; Escape; landmarks and headings; names on icon buttons; live-region
  announcements for answers, reveals and results; touch targets of at least 44px on phones; contrast of
  text and of meaningful marks in both themes, measured; colour never the only signal; both Reduce motion
  routes.
- Code: dead or duplicated code and CSS, old and new versions side by side, functions with no callers,
  selectors that match nothing, listeners added on every render, stores that grow without bound, work at
  startup that could wait, comments that tell the history of a change instead of describing the code, and
  breaks with the style rules in CLAUDE.md.
- Docs: check every statement in CLAUDE.md and atlas_handoff.md about the app against the code, and the
  vendor README against the files and their licences. A statement that is no longer true is a finding.
- Repo: files under public/ that nothing references, anything that would be deployed and should not be,
  and whether the tests in tools/tests/ run from a clean checkout.` },
]

// ---------- Review ----------
phase('Review')
const reviews = []
for (const l of lenses.filter(x => WANT.indexOf(x.key) !== -1)) {
  const r = PIN_REVIEWS[l.key] || await agent(reviewBase(l.key) + l.prompt + resumeNote(RESUME['review:' + l.key]),
    { label: 'review:' + l.key, phase: 'Review', schema: FINDINGS })
  if (!r) throw new Error('review ' + l.key + ' returned nothing')
  reviews.push({ lens: l.key, findings: r.findings || [], checked: r.checked, notChecked: r.notChecked })
  log('Review ' + l.key + ': ' + (r.findings || []).length + ' findings')
}
const all = reviews.flatMap(r => r.findings.map((f, i) => Object.assign({ id: r.lens + '-' + (i + 1), lens: r.lens }, f)))
const count = sev => all.filter(f => f.severity === sev).length
log('Findings: ' + all.length + ' (' + count('blocker') + ' blockers, ' + count('major') + ' major, ' + count('minor') + ' minor)')
if (args && args.reviewOnly) return { reviews, findings: all, stoppedAfter: 'Review' }

// ---------- Fix ----------
const FIX_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    commit: { type: 'string', description: 'Hash of the last commit of this stage' },
    outcomes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          outcome: { type: 'string', enum: ['fixed', 'not reproduced', 'wrong', 'left'] },
          note: { type: 'string', description: 'One or two sentences: what was changed, or the evidence for not changing anything' },
        },
        required: ['id', 'outcome', 'note'],
      },
    },
    checks: { type: 'string', description: 'Suites run on the final tree, with numbers' },
  },
  required: ['summary', 'commit', 'outcomes', 'checks'],
}
const fixRules = `
You are fixing review findings in a geography quiz web app: repo ${REPO}, branch ${BRANCH}; the app is ONE
file, ${REPO}/public/index.html, plus public/vendor/, public/data/ and functions/api/records.js. Read once:
${S}/BRIEF.md, ${S}/work/integration/PLAN.md, and the parts of ${S}/work/integration/progress.md that cover
what you touch. CLAUDE.md in the repo has the style and owner rules; follow them.

Rules:
- For each finding: reproduce it or confirm it in the code first. If it is real, fix the cause, not the
  symptom, and re-check. If you cannot reproduce it or it is wrong, change nothing and say why with your
  evidence. Work through blockers, then major, then minor.
- The globe engine, mastery module and quiz module are single sections of index.html with their tests in
  tools/tests/ (or, if that move has not happened, sources in the scratchpad guarded by paste checks, as
  progress.md says). After a change to one, run its tests.
- Never change what existing levels write to or read from the progress stores. Never weaken a check to
  make it pass. Comments describe the code, not the history of the change.
- No one re-checks your fixes by hand after you, so each fix must leave a check behind: for every finding
  you fix, add a check to the suite that covers that part of the app (or to tools/tests/ for a module)
  that fails on the old behaviour and passes on the new, and prove it by running it once against the
  tree before your fix (git stash, or git show of the previous commit into a scratch folder) where that is
  practical. Name the check in the finding's outcome note. Where no check is practical (a purely visual
  fix), give the screenshot path that shows it instead.
- After the fixes: node --check on the script blocks, then every suite progress.md lists (smoke at desktop
  and --mobile, shell, stats, settings, game, globe, edges, the new modes' and Explore's suites, the logic
  tests, the module tests), and a fresh look at screenshots of every screen you touched in both themes.
- Commit each coherent group of fixes with a plain message and push after each commit:
  git push -u origin ${BRANCH} (retry a network error up to 4 times). Never force-push, never open a pull
  request, never touch main, leave wip/ alone. The orchestrator sometimes commits a checkpoint of the
  working tree while you work; check git log before assuming your work is uncommitted.
- INTERRUPTIONS: this work can be cut off at any moment by a usage limit, and a fresh agent with no memory
  is then given this same brief. Keep ${S}/work/review/fix-progress.md current: one line per finding id as
  you settle it (fixed with the commit, not reproduced, wrong, left and why). FIRST read that file, git log
  and git status, and continue from where it stops.
- ECONOMY: the usage allowance is tight: Grep and ranged Reads on index.html, long output to a file.
Return one outcome per finding id.
`
phase('Fix')
const fix1 = PIN.fix1 || await agent(fixRules + resumeNote(RESUME.fix1) + '\nFindings (JSON):\n' + JSON.stringify(all, null, 1),
  { label: 'fix-findings', phase: 'Fix', schema: FIX_SCHEMA })
if (!fix1) throw new Error('fix stage returned nothing')
log('Fix: ' + fix1.commit + ', ' + fix1.outcomes.filter(o => o.outcome === 'fixed').length + ' fixed of ' + all.length)
const reviewSummary = reviews.map(r => ({ lens: r.lens, checked: r.checked, notChecked: r.notChecked, findings: r.findings.length }))
if (!FULL) return { reviews: reviewSummary, findings: all, fix1, stoppedAfter: 'Fix' }

// ---------- Verify ----------
phase('Verify')
const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          verdict: { type: 'string', enum: ['holds', 'still broken', 'fix broke something', 'agree it was not a defect', 'disagree: it is a defect'] },
          evidence: { type: 'string' },
        },
        required: ['id', 'verdict', 'evidence'],
      },
    },
    suites: { type: 'string', description: 'Every suite run on the final tree, with numbers' },
    newProblems: { type: 'array', items: { type: 'string' }, description: 'Regressions or new defects seen while checking' },
  },
  required: ['results', 'suites', 'newProblems'],
}
const byId = {}
all.forEach(f => { byId[f.id] = f })
const verifyPrompt = `
You are checking another engineer's fixes to a geography quiz web app: repo ${REPO}, branch ${BRANCH}; the
app is ONE file, ${REPO}/public/index.html. Read once: ${S}/BRIEF.md and the test-tool notes in
${S}/work/integration/progress.md. Do NOT edit the repo. Work in ${S}/work/review/verify/.

Below are review findings and what the fixer says happened to each. Trust nothing: for every finding
marked fixed, run the finding's own reproduction steps against the current app and say whether the defect
is gone and whether the fix broke anything near it; for every finding the fixer dismissed (not reproduced,
wrong, left), try the reproduction yourself and say whether you agree. Then run every suite progress.md
lists on the current tree and report the numbers, and note any regression you see on the way.
INTERRUPTIONS: this work can be cut off by a usage limit and restarted from this brief; write each verdict
to ${S}/work/review/verify/verdicts.md as you reach it and continue from that file if it exists.
ECONOMY: the usage allowance is tight; do not re-read what you have read; long output goes to a file.

Findings with the fixer's outcome (JSON):
${JSON.stringify(fix1.outcomes.map(o => Object.assign({}, byId[o.id] || { id: o.id }, { fixerOutcome: o.outcome, fixerNote: o.note })), null, 1)}
`
const verify = PIN.verify || await agent(verifyPrompt + resumeNote(RESUME.verify), { label: 'verify-fixes', phase: 'Verify', schema: VERIFY_SCHEMA })
if (!verify) throw new Error('verify stage returned nothing')
const open = verify.results.filter(r => r.verdict === 'still broken' || r.verdict === 'fix broke something' || r.verdict === 'disagree: it is a defect')
log('Verify: ' + open.length + ' findings still open, ' + verify.newProblems.length + ' new problems')

let fix2 = null
if (open.length || verify.newProblems.length) {
  const second = open.map(r => Object.assign({}, byId[r.id] || { id: r.id }, { verifierVerdict: r.verdict, verifierEvidence: r.evidence }))
    .concat(verify.newProblems.map((p, i) => ({ id: 'new-' + (i + 1), severity: 'major', title: p, where: 'see title', evidence: p })))
  fix2 = PIN.fix2 || await agent(fixRules + resumeNote(RESUME.fix2) +
    '\nThis is the second and last round: an independent checker found these still open after the first round of fixes.\nFindings (JSON):\n' +
    JSON.stringify(second, null, 1), { label: 'fix-round-2', phase: 'Verify', schema: FIX_SCHEMA })
  if (fix2) log('Fix round 2: ' + fix2.commit)
}

return { reviews: reviewSummary, findings: all, fix1, verify, fix2 }
