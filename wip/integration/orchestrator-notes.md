# Orchestrator notes for the polish stage (from looking at screenshots, 17 Nov 05:10 UTC)

- Phone, continent rounds: the opening frame is too wide. shots/app/globe/m1-europe-m-dark.png shows the Arctic,
  Greenland and North Africa with Europe's countries small in the middle; the Balkans are too small to tap without
  zooming. On portrait phones fit the continent's width to the stage width (the clear area), accepting that the
  far north or south runs under the prompt card or off the stage.
- Night Chart: the round's own land and the dimmed context land are too close in tone (same screenshot: Europe's
  countries against North Africa and Russia-in-Asia). Parchment separates them clearly (m1-africa-d-light.png).
  Raise the contrast between `land` and `dim` in the dark `--g-*` tokens.

## Added 17 Nov 06:58 UTC, after the globe stage finished

- Start to first question got slower, not faster: 793 ms against the old app's 578 ms under the harness's stock
  flags (globe stage, M5; engine build is 147-160 ms of CPU, and there is an 80 ms start timer). The owner asked
  for a faster app. Find where the time goes and cut it. The obvious lever: Home has no globe on screen, so the
  detailed world map can be fetched, parsed and built into engine layers during idle time on Home (or while the
  level sheet is open), so that Start only has to frame the view. Do the same for a level's own data (US states,
  a province file) once its sheet opens. Measure before and after with globe-stage/measure.js.
- No number from this sandbox can show GPU frame rates (there is no GPU here). Do not claim a frame-rate gain;
  report main-thread cost per frame and time to first question, and say plainly what could not be measured.
- The pasted modules (globe engine, mastery, soon the quiz module) have their sources and tests only in the
  scratchpad, which does not outlive this project. Before the docs pass, make public/index.html the one source
  of truth: move each module's test file into the repo under tools/tests/ and make it load its module by
  extracting the text between the module's banner and END marker from public/index.html (a small shared
  extractor script in tools/tests/). Run them from there, and describe that in CLAUDE.md in place of the paste
  checks. tools/ is never served (the site root is public/).
- Phone held sideways: the prompt card covers the top of the fitted map (globe stage's known wart). Give short
  landscape windows a compact prompt card or move it to the side.
- Pin the City, Europe (shots/app/globe/m3-pin-europe-drop-d-light.png): after a drop the view sits with Europe in
  the lower half and the prompt card over Scandinavia. Check the opening frame and the after-drop frame are
  centred on the clear area.

## Owner decision, 2026-11-17 (about 17:35 UTC): lean final review
The owner chose the lean review. atlas-final-review.js now runs two reviewers by default (play, which also does
the scripted fact check and the no-hints check; and globe), then one fix stage in which every fix leaves a
regression check behind, and stops. The orchestrator re-checks the fixes from the suites. The learning and craft
lenses stay in the script (args.reviewers) and the Verify phase is behind args.full, should the owner ask later.

## 18 Nov, about 11:00 UTC: stopped at the owner's request before the window ends
- Review fixes are done and pushed (b42cd1b..5b7c455); docs follow them (ff12e03 and the handoff note after it).
- My re-check: full suites + `tools/tests/run.js --globe` + three smoke-desktop repeats run by
  work/review/recheck/run.sh; results in work/review/recheck/status.log and suites.log.
  One failure seen so far, explore (phone) "learn: a clean pass moves to level 2": order-dependent
  (Fiji older + Australia newest, 1 of 42 pairs), the same on 84f0c03 (recheck/path-oceania-*.log). Not a regression.
- Known limit confirmed with logic-tests/x-offline-reset.js and written into atlas_handoff.md: a reset made
  offline costs a round synced elsewhere in between its records and mastery.
- Left to do on "resume": read status.log; if the suites are clean (bar the flake above), remove wip/ in a
  final commit, push, and give the final report. Nothing is scheduled.
