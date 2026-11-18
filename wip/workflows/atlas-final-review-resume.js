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
const PIN = {"reviews": {"play": {"findings": [{"title": "A reset on one device erases what another device played after the reset but before its next load (lost everywhere)", "severity": "major", "where": "public/index.html syncApplyRemote() ~15654-15661 (remoteReset > localReset -> eraseProgress() wipes every store whatever its date); push-only syncAfterGameEnd() ~15797", "evidence": "Reproduced with two simulated devices on one stubbed /api/records: /tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad/work/review/play/sync2.js step 4, output in sync2.log. A and B linked and in sync. A: Settings -> Reset progress (resetAt T pushed, server records 0). B's page is still open (no reload); B plays Name It Oceania to the end AFTER T; its push carries resetAt 0 plus all old data and replaces the server blob. A reopens: blob set aside as stale, A pushes its empty state. B reopens: pull sees resetAt T > 0, eraseProgress() runs: log line '4. B reopened: records {} mastery {days:{},items:{},v:2}'. The Name It round played after the reset is on neither device nor the server. Not rated blocker only because it needs an explicit Reset plus a second device that keeps playing without reloading; it is still unrecoverable loss of rounds played after the reset.", "suggestedFix": "On a newer remote reset keep what is dated after it (records by lastPlayed/date, daily attempts by completedAt, pin games by at, focus/learn by savedAt, mastery items and day rows by day >= the reset day) instead of wiping everything; or pull-and-merge before every push so a device learns of the reset before it plays on."}, {"title": "A round whose push failed (offline, 413, 5xx) is never re-sent on the next visit, and the sync status then reads \"Up to date\"", "severity": "major", "where": "public/index.html syncPull() ~15773 (every successful pull sets lastError: null); syncOnAppLoad() ~15790-15796 (pushes only when the pull was stale); the only other pushes are round end, reset, create/link, Sync now, username edit", "evidence": "sync2.js steps 2 and 3 (sync2.log). Step 2: device B linked; offline; finish Flags of Oceania -> nav dot error and meta lastError 'network' (correct). Back online, reopen the app: Settings shows 'Up to date \u00b7 last synced just now', dot green, but the server blob has no flag|Oceania|normal ('server has the offline round: false') and device A never receives it after reloading. It stays unmirrored until B finishes another round or presses Sync now. Step 3: after a 413 the line reads 'Your progress has grown too large to sync\u2026'; reopen the app with pushes still answering 413 and it reads 'Up to date \u00b7 last synced just now' with no error dot. Same design, by code and sync.js S3: a push sends only this device's snapshot, so the server holds whichever device pushed last; a device loaded earlier overwrites another device's push at its own round end, and the first device does not send again until it finishes another round. If that device is cleared or retired first, its rounds are on no other device.", "suggestedFix": "Do not let a pull clear a push error. On load, after a successful pull, push when the last push failed or when local progress changed since the last successful push (a dirty flag set by store writes). Better: pull-merge-push at round end instead of push-only."}, {"title": "Daily Five card never rolls over at UTC midnight while Home is open; its stale buttons then act on the new day's puzzle", "severity": "major", "where": "public/index.html startDailyCountdown() ~4732-4752 (`next.setUTCHours(24,0,0,0); const ms = next - new Date(); if (ms <= 0) { renderToday(); return; }` \u2014 next is always the midnight after now, so ms is never <= 0; the old app had the same dead check at L4158); 'replay-daily' action ~15270 uses todayUtcKey(); shareDailyResultFromMenu() ~14736", "evidence": "play/daily.js with Playwright's clock (daily.log). 23:40 UTC: play today's five (#207), return Home: card 'Today's puzzle complete \u00b7 Next puzzle in 00:19:46'. Clock passes midnight (00:10 UTC next day): card still 'PUZZLE NO. 207 \u00b7 Next puzzle in 23:49:41 \u00b7 Today's puzzle complete', masthead still 'Wednesday, 18 November \u2026 Today's Daily Five is done'. On that stale card 'Share Result' does nothing, and 'Practice Replay' starts Daily #208 \u2014 the NEW day's five countries (Canada, Comoros, Falkland Islands, France, Lebanon) as a practice round; leaving it shows #208 unplayed, so the scored attempt can be played after seeing the answers. UTC midnight is 7 pm US Eastern.", "suggestedFix": "Remember the date key the card was drawn for; in tick(), when todayUtcKey() differs, redraw Home (masthead and Today). Make the played card's Replay and Share use the card's own date key rather than today's."}, {"title": "Name It: typing a country's full name is accepted mid-name at its short form and the rest of the typing lands in the next question", "severity": "major", "where": "public/index.html onAnswerInput() ~6881-6891 (exact, non-partial match taken at once); Quiz.matcher startsAnother() ~13155 only looks at OTHER entries, so 'bosnia', 'trinidad', 'antigua', 'saint kitts'/'st kitts', 'saint vincent'/'st vincent' (aliases that begin their own country's full name) and 'United States' (which begins its own alias 'united states of america') are not partial; the field is locked 900 ms, then the next question takes the keystrokes", "evidence": "play/spill.js (spill.log), keys sent at 5 per second then Enter: 'Bosnia and Herzegovina' -> accepted at 'Bosnia'; when the typing ends the question on screen is Chad, the field holds ' Herzegovina', Enter gives 'That name isn't in this atlas \u2014 check the spelling' (screenshot /tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad/work/review/play/shots/spill-Bosnia_and_Herzegovina.png). Same for Antigua and Barbuda (' Barbuda'), Saint Kitts and Nevis (' Nevis'), Saint Vincent and the Grenadines (' the Grenadines'), Trinidad and Tobago ('d Tobago'), United States of America ('merica' \u2014 one keystroke from 'america', an accepted name of the United States, which with Enter would be a wrong try on the next country). No try was lost in these runs; the leftover text and the 'not in this atlas' note appear on every such name.", "suggestedFix": "Treat a spelling as partial when it is a proper prefix of another spelling of the SAME entry (wait for Enter or a short pause), or ignore keystrokes that arrive within a moment of the question changing / until the cleared field has been typed into afresh."}, {"title": "Returning player: Stats and Home headline say \"Rounds played \u2014 none yet\" while the same page lists dozens of rounds", "severity": "minor", "where": "Stats headline figures and Home masthead (renderStats / masthead read mastery.totals() only)", "evidence": "play/oldplayer.js seeds only the OLD stores (atlas-records with gamesPlayed 4,2,3,1,9,31,6,2,2,5,2,7; six days of daily attempts). Stats prints 'ROUNDS PLAYED \u2014 none yet', 'TIME PLAYED \u2014 none yet', 'DAY STREAK \u2014 starts with a round', and lower down 'Europe \u2026 ROUNDS 9', '31 puzzles played in all', Daily 'CURRENT STREAK 6 days' (play/old-stats.txt). After one new round the headline reads 1 round for good. Storage itself is untouched (every seeded key byte-identical after load, sheets, Stats, Settings, Explore).", "suggestedFix": "Count rounds as mastery sessions plus the gamesPlayed of record entries from before mastery's first day (or note the pre-mastery total once), or label the figure 'since <date>'."}, {"title": "Synced totals take the larger device, not the sum, for a day both devices played", "severity": "minor", "where": "Mastery mergeStores() (day rows keep the larger of each number; per item the history with more answers wins) ~12477; syncMergeRecordEntry gamesPlayed = Math.max ~15732 (the latter is the recorded D14)", "evidence": "sync2.js step 1: A played 1 round (7 answers), B played 2 rounds (20 answers) the same day, then synced. mastery.totals() on both: games 2, questions 20; stored item answers 20 of 27 given; Oceania record gamesPlayed 1 though it was played twice. Stats' Rounds played, Activity calendar and first-try accuracy under-count for a family sharing one code on one day. progress.md calls mastery.totals().games 'the reliable round count'; under sync it is not.", "suggestedFix": "Keep per-device counters for day rows (sum across devices, max within a device), or document the limit beside D14."}, {"title": "A finished Learn ladder turns the level card back to \"New\"", "severity": "minor", "where": "public/index.html renderLevelCard ~4944-4958: getLearnProgress(level.key) is null for the { done: true } marker, so `untouched` is true again", "evidence": "play/modes3.js (modes3-learn.log, and on a phone modes3-learn-m.log): Home -> Oceania -> Learn Them -> clear all 7 levels ('Ladder Complete', atlas-learn.oceania = {done:true}). Back on Home the card that read 'Learning \u00b7 level N of 7' reads 'Oceania 7 countries New' (aria-label ends ', New').", "suggestedFix": "Treat the done marker as touched: show 'Ladder complete' or 'Not played yet' instead of the New pill."}, {"title": "Pin the City cards say \"N due\" but Smart Review never offers pin cities and says \"Nothing due\"", "severity": "minor", "where": "renderLevelCard ~4957 prints summary.due for every level; reviewLevels()/reviewGroups() ~5054-5066 leave city-pin out; lede and Smart Review card count reviewable skills only", "evidence": "play/review.js (review.log): store holds two due city-pin items. Home pills 'pin-world:2 due pin-europe:1 due pin-oceania:1 due'; after the whole Smart Review playlist the card reads 'Nothing due', the lede 'Nothing is due for review', and the three pin cards still read 'N due' (AFTER pills). Any far pin or skip is due the same day; there is no way to practise only those, and on World (20 drawn from 120) the pill can stay for many rounds.", "suggestedFix": "Do not print a due pill for a level whose skill has no review, or give Pin the City a review round."}, {"title": "The browser/phone back button never moves between views or closes a sheet; it leaves the site", "severity": "minor", "where": "switchScreen()/setAddressBar() ~15182, ~4351 use history.replaceState only; no popstate handling", "evidence": "play/nav.js views part (nav1.log): opened from about:blank; Home -> Stats -> Explore -> Settings by the nav: history.length stays 2; first browser Back lands on about:blank. Hand-typed hashes do add entries and Back then works, so the two ways of moving differ. PLAN.md section 2 asked for the back button to work. On Android this also applies with a level sheet open or a round in play (the round is abandoned; answers already given are kept).", "suggestedFix": "Push a history entry on view changes, sheet open and round start, and handle popstate (close sheet / leave round / previous view)."}, {"title": "A second tab's Home shows the new mastery but not the new best after a round finishes in another tab", "severity": "minor", "where": "storage listener ~13569 redraws only for atlas-mastery; finishGame writes the mastery session before atlas-records", "evidence": "play/nav.js tabs part (nav3.log): two tabs on Home; tab 1 plays Capitals of Oceania to the end; tab 2 (not reloaded) reads 'Oceania 7 capitals Not played yet' with the mastery ring updated, until something else redraws Home. (Both tabs' rounds do end up in records, focus and mastery; nothing is overwritten.)", "suggestedFix": "Redraw on any atlas-* progress key, or debounce the redraw until the writer's round-end writes are done."}, {"title": "With storage blocked, \"Create sync code\" hangs on \"Creating\u2026\"", "severity": "minor", "where": "public/index.html syncCreate() ~15941-15953 and syncCodeDialog() ~15956 (`if (!token) return;`)", "evidence": "play/nav.js storage part, in all three throwing modes (setItem throws; every Storage method throws; the localStorage getter throws): Settings -> Create a sync code -> Create sync code: the token cannot be saved, the push returns no_token, the set-up dialog stays open with its button disabled and nothing says why (nav3.log 'after create: dialog: Create a sync code \u2026'). Play itself is unaffected in all three modes (full round, results, practice, four views, a Daily round, no page error).", "suggestedFix": "When the token does not read back after saving, re-enable the button and say that this browser is not keeping data so sync cannot be set up."}, {"title": "Flag questions put the bare flag emoji in the aria-live prompt, which screen readers announce as \"flag: <country>\"", "severity": "minor", "where": "public/index.html ~6563 setPrompt('Which country's flag is this', Quiz.flagPrompt(...).flag) writes the regional-indicator pair as text of #prompt-country inside #prompt (aria-live=polite, aria-atomic)", "evidence": "By code only (no screen reader in this sandbox): elsewhere the flag span is aria-hidden (flagHtml ~6722, Explore ~8698), but the question itself is the raw emoji in a live region; VoiceOver, NVDA and TalkBack name flag emoji by country. The automated hint scan (play/typed.js, typed.log HINTSCAN) otherwise found the answer nowhere in the game screen's markup, attributes, title or URL in name-it, flag, capital-find, capital-pick, both US capital modes, pin and cities; no title= attribute exists in the file; the Name It field has autocomplete=off, no datalist, and typing adds nothing to the page.", "suggestedFix": "Give the prompt flag an aria-label such as 'a flag' (or aria-hidden with a spoken 'flag shown')."}, {"title": "?play=constructor, ?play=__proto__ and similar are taken for a level", "severity": "minor", "where": "public/index.html linkedLevel() ~4365: `linkSlugs()[slug]` on a plain object", "evidence": "play/nav.js links part (nav1.log): '?play=__proto__' and '?play=constructor' land on Home with 'That level isn't ready to play yet.' instead of 'That link doesn't lead to a level.' (Object.prototype members are truthy start arguments that reach startGame). Nothing is written to storage.", "suggestedFix": "Look the slug up with hasOwnProperty or a Map."}], "checked": "Nothing in the repo was edited. Scripts, logs and screenshots are in /tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad/work/review/play/ and the running log is /tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad/work/review/play/findings.md. No blocker was found; 4 major and 9 minor findings.\n\nFound fine:\n- **Facts (facts.js, borders.js):** all 184 countries against world-countries and countries-list. Every ISO code and flag emoji agrees. Continents agree except Cyprus (app Asia, dataset Europe; left as the owner's call). Capitals agree or differ only by transliteration or a defensible primary with the other accepted (Mbabane/Lobamba, Sri Jayawardenepura Kotte/Colombo). The one disagreement that is not spelling: the app teaches Ciudad de la Paz for Equatorial Guinea (\"by decree since January 2026\" per the code comment) with Malabo accepted, while both datasets say Malabo; I took the app as right from memory, not from a source. The 50 US state capitals agree with usa-states. Explore's card shows the right capital for all 184; its borders agree for the 182 countries the dataset has, apart from deliberate map choices.\n- **Typed names through the page's Quiz module:** 5,754 checks (every name and alias, three casings, seven Name It levels) resolve to their own country in their level and The World and read \"outside\" elsewhere. Every spelling, translation and code of 250 world-countries entries was run through the World matcher; none resolves to a different country.\n- **Name It through the real field:** 20 aliases taken as typed and 20 one-slip misspellings forgiven after Enter, each +2 and recorded once under country-name. Niger/Nigeria, Guinea/Guinea-Bissau and Dominica/Dominican Republic wait for Enter. Junk text costs nothing.\n- **Every mode end to end from card and sheet, desktop and phone:**\n  - Played in full: Oceania, South America, Canada, capitals both directions, flags and Name It on Oceania, Name It South America, Pin the City (Oceania, World), the Daily Five, States \u2192 Capitals, Capitals \u2192 States, Cities Northeast.\n  - Six mixed answers each: The World, the four World-size country quizzes, China, India, three Russia rounds, Africa, Asia, States.\n  - Normal, Hard and Uncharted, chart and satellite, mouse, touch and keyboard-only were all used.\n  - Every resolved question made exactly one mastery record with the right skill, name and outcome; one session per finished round, none for abandoned ones.\n  - Learn ladders (Oceania to the end with a miss, States, Canada) recorded no items and one session per cleared level.\n  - Focus practice, daily practice replay and an 8-round Smart Review playlist left records and focus lists byte-identical.\n  - View on the map records nothing; flag and capital twins behave as documented.\n- **Figures against the store:** Home, Stats, collection headers, every level card and the Smart Review count match the store for two seeded players.\n- **Returning player:** old-shape stores are byte-identical after load and after visiting every view. Records and focus code is source-identical to 1c74e1d. Share builders are identical except that the time is now the round's own; name tables, province data and the daily generator are unchanged. US rounds write the old keys.\n- **Sync:** link flow and merges give identical stores on both devices. Offline and 413 are shown at the time. Corrupt and oversized blobs never crash and never destroy local stores. A reset reaches the other device. The heavy player's payload is 122,003 bytes (119 KB of 256).\n- **Navigation and robustness:** hashes, 20 valid and invalid level links, resize and rotation mid-round, a second tab, and localStorage throwing in three ways all leave play intact.\n- **Module tests re-run at HEAD:** world facts, quiz (44) and mastery (709) pass. App files are unchanged since c15645d.", "notChecked": "- **Old app not run side by side.** \"Byte for byte\" share text and \"what old levels write\" rest on a source diff against 1c74e1d plus sample outputs from the new app. One intended difference: the share time is now the round's time, not the time at the moment Share is pressed.\n- **The World (184) and the World-size quizzes were not played to the last question** (six questions each); full rounds were played for levels of 5 to 50 items. India, China and the Russia rounds were also six questions each.\n- **Not exercised:** the three unavailable city levels beyond their link refusal, the no-WebGL fallback, tiles failing mid-round, the Explore view beyond its facts, links and hash selection, the export download itself, phone landscape beyond the rotation test, and the unplayed Daily card across midnight (same root as the played-card finding).\n- **Sync was only run against a stub** that follows functions/api/records.js; no real KV or live site. The \"last writer wins on the server\" consequence in the push finding is from code and one run (S3), not a dedicated scenario.\n- **The flag-emoji screen-reader finding is by code only.** Real phone keyboards (autocorrect, IME) in Name It could not be tested either.\n- **Suites not re-run:** the stage suites (unchanged tree) and tools/tests --globe. In my module-test run the fourth suite, mastery across zones, had not finished when I closed; it passed at 02:38 UTC on the same files.\n- **Sandbox limits as given:** no GPU, no real Esri tiles, no Safari or Firefox.\n- No findings were held back; all 13 are reported."}}}
const PIN_REVIEWS = PIN.reviews || {}
// What an interrupted attempt at a stage left behind, written by the orchestrator at relaunch.
const RESUME = {"review:globe": "The reviewer before you was cut off by the usage limit at 04:45 UTC on 2026-11-18 with the review nearly\ncomplete. Its file work/review/globe/findings.md holds four confirmed findings (F1 to F4, with evidence and\nscreenshots) and a list of what is covered: picking at five sizes, real taps for every level on a phone,\nframing of shown places and reveals, the engine read, the Canvas 2D rounds, context loss, marks after\nturning, zooming, theme, style and resize, imagery with the stand-in tiles, and resources over 40 rounds.\nDO NOT REPEAT ANY OF THAT. Read findings.md first and trust it.\nWhat was still open:\n1. Measurements against commit 1c74e1d. The per-frame and start-up run had just finished (results in\n   work/review/globe/measure-results-review.json, tool measure-copy.js); the reviewer had copied the polish\n   stage's perf tool to perf-copy.js to compare cold load, level link and Start to first question, and had\n   not run it. Read the results that exist, run what is missing (at least five runs for anything on\n   satellite), and report only cases where the new app is slower, with the numbers.\n2. One item from its list: the cost of the Learn label placement for a country whose anchor lies outside\n   the frame (Russia in Europe's ladder; learnAnchor / anchorInBox), when a zoom settles.\n3. Anything on the lens's list that findings.md does not mark done, if time allows: check the list once.\nThen return the findings: the four in findings.md (copied faithfully, with their evidence) plus anything\nnew, and the checked / not checked summaries taken from the file's coverage notes.\n"}
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
- Test tools as they stand: ${S}/work/integration/polish/run-suites.sh [names] runs every suite of every
  stage, two at a time (a line per suite in polish/suites.log, full output in polish/suites/; with names it
  runs only those and appends). The module tests are in the repo: node tools/tests/run.js --quick (add
  --globe after a change to the engine). The seeded players are dated: after a UTC day change run
  harness/seed-rich.js four times (no flags; --unplayed --out=harness/scratch/seed-rich-unplayed.json;
  --quiz; --heavy) and then shell/gen-seed.js, as the polish stage's notes in progress.md say. Start-up
  times on satellite fall into two groups on this machine (about 90 ms or about 260 ms): never read one run
  as a regression, take at least five.
- Already known and recorded, so not findings: the favicons and og-image.png the page links are not in the
  repo (the owner's assets); Afghanistan's flag, the strict margin for forgiven misspellings and the lack
  of a typed-capitals mode are the owner's call; on a phone the Learn study view turns to the newest name;
  the sideways-phone layout puts the prompt card at the left.
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
- After the fixes: node --check on the script blocks, then every suite (the runner below, with no names),
  the module tests, and a fresh look at screenshots of every screen you touched in both themes.
- Test tools as they stand: ${S}/work/integration/polish/run-suites.sh [names] runs every suite of every
  stage, two at a time (a line per suite in polish/suites.log, full output in polish/suites/; with names it
  runs only those and appends). The module tests are in the repo: node tools/tests/run.js --quick (add
  --globe after a change to the engine). The seeded players are dated: after a UTC day change run
  harness/seed-rich.js four times (no flags; --unplayed --out=harness/scratch/seed-rich-unplayed.json;
  --quiz; --heavy) and then shell/gen-seed.js, as the polish stage's notes in progress.md say. Start-up
  times on satellite fall into two groups on this machine (about 90 ms or about 260 ms): never read one run
  as a regression, take at least five.
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
