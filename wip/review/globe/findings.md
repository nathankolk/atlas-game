# Globe review — findings (lens: the globe, in every mode)

Tools written for this review are in this folder: rlib.js (launcher: software compositing, any size, touch),
pick-probe.js + pick-report.js (every item of every level: would a tap on its anchor answer it; out/pick-<size>.json),
clear-trace.js, flag-card.js, flag-card2.js (what the opening frame measures), rshot.js (screenshots -> shots/).
Sizes: d1280 = 1280x800 mouse, d1024 = 1024x768 mouse, t768 = 768x1024 touch, p390 = 390x844 touch, p360 = 360x640 touch.

## Covered so far
- [done] Read BRIEF, PLAN, progress.md (globe stage, explore traps, polish final record), MAP section, startGame, answer handlers.
- [done] Picking probe, all 5 sizes, all tap-answered levels (world/continents, US states + capitals->states, NE cities,
  6 province rounds, capitals-find x7, flags x7): NO item is unanswerable by its anchor; none needs more than x8 zoom
  at any size once turned to. (midwest/south/west cities are "coming soon" as in the old app: not a finding.)
- [done] frame-play.js (skips every question; reduced motion, fresh page per level; out/frame-p390.log, frame-d1280.log):
  the place a question shows (name-it, capital-pick, states->capitals) and every revealed answer had its anchor in
  sight and clear of card/toast/controls/tally in every question of: name-world, capitals-world, us-state-to-capital,
  name/capitals for Europe, N America, Asia, Africa, S America (p390 and most at d1280), World/Europe/N America/Asia/
  Africa/us-state/india/china reveals (p390). Only partial covers: the answer toast lies over the top ~46 px of the
  clear area (Libya 135/256 outline points, Guyana 123/287, Norway/Canada's north under the card) - not reported.
  NOTE for a successor: `#zoom-hint` stays in layout at opacity 0 after its 5 s fade; "hint" covers in the logs are
  false positives after the first seconds of the first round.
- [done] Engine read: picking, view/fly/zoom, fitTo, frame loop, resize, imagery (tiles, windows, placeImagery),
  attach/pause/resume, context loss, shaders. Nothing found by reading except what is listed below.
- [running] tap-real.js p390 (real touchscreen taps for every item; out/tap-p390.log); frame-play p390 pins.
- [todo] marks/reveals after turn/zoom/resize/theme/style/review (scenario.js); imagery shots; nogl round; context
  loss; resources after 20 rounds (res-rounds.js written, not yet run); measure.js vs 1c74e1d; recentre after resize;
  Learn anchorInBox cost (Russia in Europe's ladder).

## Findings

### F1 (major) Under Reduce motion the opening frame is measured from the previous round's prompt card
- Where: `frameMap()` -> `placeGlobeHost()` -> `stageClearArea()` (index.html ~6454, 7772, 7848) reads `#prompt`'s box
  in the same task in which `setGameChrome()` (6358) changed the card (is-flag, choices hidden, answer form). The
  reduced-motion CSS (index.html 2363-2379: `transition-duration: 0.01ms !important` on `*`) turns every such change
  into a transition, so the box read is still the OLD card. (With motion allowed the box is right.)
- Evidence: `node flag-card.js p390` (context has prefers-reduced-motion) prints, at the moment the card is measured,
  `name.class=prompt-name pulse is-flag ... minH=42px` (the flag rule's 98px not yet in effect), `clearTop=167`; the
  card then grows from 66..155 to 66..211. `flag-card2.js` shows `transition=all/1e-05s anims=[...min-height:running...]`.
  Same run with motion allowed (`flag-card2.js p390 motion`): minH=98px at once, clearTop=223.
  `clear-trace.js d1280` (reduced) vs `clear-trace.js d1280 ... --motion`: flags-world after World: clearTop 200 (card
  ends at 258) vs 270; World after flags-europe: clearTop 270 with a 188 card (globe radius 243px instead of 281px);
  capitals-world after a flag round: clearTop 388 with a card ending at 306.
- Seen: shots/flags-world-d1280-reduce.png (seed `atlas-motion=reduce`, i.e. the Settings switch, fresh load ->
  Flags of the World at 1280x800): the flag card lies over the top of the globe; Iceland, Scandinavia, the north of
  the British Isles and northern Russia are under it at the opening view. pick-probe (d1280, d1024, reduced) lists
  Sweden, Iceland, Russia anchors as `home:hud:prompt` for flags-world.
- Fix idea: measure after the styles have settled (force the card's final layout: e.g. suspend transitions on the card
  while it is set up, or compute the clear area from the mode's known card height / re-run frameMap() after the first
  prompt when still at home), or exclude layout properties from the reduced-motion rule.

### F2 (major) On phones a continent's/level's opening view puts askable places under the zoom buttons and the tally
- Where: `stageClearArea()` (narrow stage: the map keeps its full width, controls and tally "sit over the map's lower
  corners"), `TALL_FRAMES['North America']` ends at Barbados/Trinidad, which is where the controls column is.
- Evidence (pick-probe, opening view, elementFromPoint at each item's anchor; motion setting does not matter):
  - North America (also capitals-find-north-america, flags-north-america) at 390x844: Trinidad and Tobago, Saint
    Vincent and the Grenadines, Saint Lucia, Saint Kitts and Nevis, Grenada, Dominica, Barbados, Antigua and Barbuda
    are under `#zoom-out-btn` / `#zoom-reset-btn` (8 of 23 countries). At 360x640: Trinidad, St Vincent, St Lucia,
    Barbados (4; in the flags level all 8).
  - Africa at 360x640 (and flags-africa at 390x844): Mauritius under the zoom buttons.
  - States of India at 360x640: Kerala, Tamil Nadu and Lakshadweep under the tally (`#game-legend`).
  - Russia south at 360x640: Karachay-Cherkessia, Kabardino-Balkaria, North Ossetia, Adygea under the tally.
  - Flags of Oceania at 360x640: Fiji under `#zoom-in-btn`.
- Seen: shots/na-p390.png (the eastern Caribbean is exactly under the + / - / recentre column; the one-time
  "Pinch to zoom" pill also lies over Central America), shots/india-p360.png (India's south under the tally and pill).
- The same corner takes part of a country a question SHOWS (second reviewer, `node misc.js --parts=A`, out/misc.log):
  Capitals of Africa at 390x844, "Which city is the capital of Madagascar": 107 of Madagascar's 266 outline points
  are under the + / - buttons after the globe has turned to it (shots/shown-p390-Madagascar.png: the island's
  right half is behind the column). The previous reviewer's play-through log (out/frame-p390.log) has the same
  figure, and Mississippi 148 of 245 points under the tally in States -> Capitals (not reproduced in a practice
  round of eight states: it depends on where the globe stood before the question).
- Pin the City, where the player has to tap the city's spot (second reviewer, `node pin-open.js`, out/pin-open.log,
  elementFromPoint at each city's true position at the opening view, hint gone): Pin Africa: Antananarivo is under
  the recentre button at 360x640 (303,461) and under the controls column at 390x844 (365,596); Pin North America:
  Santo Domingo under the controls column at 360x640 (302,432). shots/pinopen-p360-pin-africa.png: Madagascar is
  behind the + / - / recentre column except for its western edge. The other four continents are clear at both sizes.
  (frame-play at p360, out/frame2-p360.log: after a skip the revealed city is under the same buttons for these two.)
- The places can be reached by dragging the globe, so nothing is unanswerable; but a tap where the island is presses
  Zoom out instead, and the player cannot see them at the opening view.
- Fix idea: on a narrow stage keep the frame clear of the controls column / tally (shift the centre, or inset the
  right edge by the controls' width for the lower part), or add those corners to what `stageClearArea` excludes when a
  frame point falls in them.

### F3 (minor) After a resize while the globe is away from the opening view, Recentre goes to the frame of the old window
- Where: `refitMapSoon()` (index.html ~15437): when `mapAtHome()` is false and no country is being shown it only calls
  `placeGlobeHost()`; `map.home`, the engine's home (`setHome`) and the zoom limits stay those computed for the old
  window, so `zoomReset()` / key 0 / the recentre button fly to a view that no longer fits. (It corrects itself only
  at the next resize, because then `mapAtHome()` is true.)
- Evidence: `node scenario.js --size=d1280 --which=find` — Europe at 1280x800, drag + wheel, window to 900x620,
  press 0: view back at lon 10 / lat 54.39 / k 1.668 (the 1280x800 home); 24 of 52 points of Europe's frame box
  then lie outside the clear area (frame 183..717 x 170..562 px against clear 84..816 x 200..532).
  shots/scn-d1280-find-6-recentred.png: the North Cape is under the prompt card and the Mediterranean islands under
  Skip. The same applies to a phone turned on its side after the player has dragged the globe.
- Fix idea: on resize always recompute the round's home (`frameMap()` on a saved copy of the current view: compute
  the frame, `setHome`, limits, then restore the player's view), or mark the home stale and refit on the next reset.

### F4 (minor) Northeast Cities: dots that coincide at the opening view hide each other's marks and swallow taps
- Where: `drawCityDots()` (index.html ~8063: dots drawn in list order, 6 px radius at every zoom) and `onMapClick` /
  `dotNear()` (~7942, 7959: the nearest centre wins; "an answered one takes it and does nothing").
- Evidence: `node dots.js` — at the opening view New York and Jersey City are 1.6 px apart at 1280x800 and 1.0 px at
  390x844; Boston and Cambridge 2.3 / 1.4 px; Newark~Elizabeth 4.4 / 2.7 px; 11 pairs (desktop) and 27 pairs (phone)
  are closer than two dot radii. shots/dots-nyc-d1280.png (New York marked found, Newark missed, as the game marks
  them): New York's green mark is completely under Jersey City's unanswered dot and Newark's red one shows as a
  sliver. Once New York is answered, a tap on the visible dot there goes to New York when its centre is the nearer
  by a fraction of a pixel and then does nothing; before that it is a coin toss between the two names, and the
  wrong one costs a try. pick-probe: New York and Jersey City need x12 zoom on a phone (x6-x8 on desktop) before
  6 of 8 taps 8 px off centre pick the right dot.
- Not a blocker: every city is answerable after zooming (real taps: tap-real.js answered all 40 on a phone).
- Fix idea: draw marked dots after (over) unanswered ones, let an unanswered dot within reach win over an answered
  one, and open the level a little closer or spread coincident dots apart by a few px at low zoom.

## Coverage notes (continued)
- [done] tap-real.js p390, real touchscreen taps, every question answered first try: World 184/184 (152 at the opening
  view, 32 after turning, none needing zoom), Africa 54, Asia 48, Europe 39, N America 23 (8 only after turning: F2),
  S America 13, Oceania 7, us-state 50, us-capital-to-state 50, northeast-cities 40, canada 13, china 33, india 36,
  russia-west 29, russia-south 27, russia-east 27. (capitals-find-world, flags-world not run: same picking path.)
- [done] Canvas 2D (no WebGL) full rounds with real clicks at d1280: Europe 39/39, northeast-cities 40/40, india 36/36;
  engine draw 30-94 ms a frame here.
- [done] context.js: context lost mid-round on satellite and restored (marks, imagery, picking back); never restored
  (Canvas 2D after ~4 s, sat-on off, notice, layers button hidden, marks kept, round and next round playable).
- [done] scenario.js d1280: marks (found/second/missed), Learn names, pin + miss line, city dot marks survive turning,
  zooming, a theme change by the OS scheme, map-style change, resize, "View on the map" (a click there does nothing).
- [done] imagery with stand-in tiles: antimeridian (no seam), both poles (cap filled from the last tile row), deep
  zoom (k 95, tiles z9 aligned with borders), failed tiles (chart look, toast), Uncharted (no borders; flash/reveal
  outline shows the shape), credit line shows whenever imagery shows.
- [done] res-rounds.js (out/res-d1280.log): 40 rounds over modes/themes/styles/Explore/Stats/review. GL objects flat
  after round 5 (6 textures, 13 buffers, 3 programs), canvases 2 in DOM, heap 55.2 -> 55.4 MB from round 20 to 40,
  listeners 64 + 4 per capital question asked (the choice buttons, dropped with their DOM, not a leak), no intervals
  off the game screen, 0 rAF callbacks and 0 engine frames in 3 s on Home, Stats, Settings, Explore (at rest),
  results, and in a round at rest.

## Second reviewer (resumed 08:05 UTC, 18 Nov) — what is being done
- [running] perf-copy.js (stock flags): load + link + start for new and old, 5-6 runs each -> out/perf-*.log, perf-results.jsonl
- [todo] Learn label placement cost (Russia in Europe's ladder) when a zoom settles

### F5 (minor) Cold start is slower than the old app's (1c74e1d) when the network costs nothing: Home and a level link
- Tool: `node perf-copy.js --only=load,link --runs=5 --tag=review` (the polish stage's perf.js; stock harness flags, local
  server, fonts from memory). Raw rows: perf-results.jsonl (tag review), out/perf-loadlink.log.
- Home usable (level cards / menu buttons in the page), ms after navigation, 5 runs:
  new desktop 216,269,203,235,217 (median 217) | old desktop 194,146,149,161,150 (150)
  new phone   229,228,255,202,240 (229)        | old phone   153,175,169,181,174 (174)
- Level link `?play=world`, cold, navigation -> a question that can be answered, 5 runs:
  new desktop 700,714,712,732,643 (712) | old desktop 573,554,662,530,558 (558)
  new phone   725,746,768,737,745 (745) | old phone   535,540,641,556,536 (540)
- Cold load of Home: new 10 requests, 1,693,833 B raw / 510,122 B as brotli; old 9 requests, 1,518,178 B / 494,320 B.
  The document itself is 744,103 B (172,190 brotli) against 299,997 B (63,756); the old app's d3 bundle (279,633 /
  77,575) is gone, four vendor files (67,913 / 22,157) replace it.
- Same direction under software compositing (previous reviewer's measure-copy.js, 3 runs, measure-results-review.json):
  `?play=world` first question new 1250 / 1358 (satellite) desktop, 1142 / 1844 phone; old 702 / 726, 661 / 657 (there
  every WebGL frame is CPU-drawn, so this overstates it).
- Caveat: in the harness the old app's three extra origins (cdnjs, jsdelivr) answer at once from disk; on the real
  network the new app's same-origin files save those connections. So: slower in CPU terms (a 2.5x larger document
  to parse, engine build of the 50m world ~150-170 ms before the first question), not necessarily on a real line.

## Coverage (second reviewer)
- [done] perf-copy load + link, both apps, both sizes (above).
- [done] perf-copy start (stock flags; new 6 runs, old 5 runs; out/perf-start-new.log, perf-start-old.log). NOT slower anywhere:
  Europe chart new 59 desktop / 72 phone vs old 399 / 402; States 62 / 65 vs 708 / 681; Europe satellite 112 / 103
  (runs 86,112,115,270,109,93 and 97,103,108,243,98,89: the slow group is one run in six) vs 416 / 438; India 108 / 85
  (old: chooser, not comparable). Painted two frames later: new 64-128, old 405-718.
- [done] per frame (previous reviewer's measure-copy.js run, software compositing, measure-results-review.json): script per
  frame new 0.39-0.47 ms vs old 0.26-0.41 ms (both far under a frame); engine draw median 0.2-0.3 ms; after a gesture
  new 2-3 ms of script vs old 14-41 ms. Frame intervals 200-316 ms (new) vs 16.7-33 ms (old) there are the CPU-drawn
  WebGL canvas of this sandbox (no GPU), a known limit, not reported.

### F6 (major) Europe's Learn ladder freezes the page for about a second (several on a phone) when Russia's name is first placed
- Where: `learnAnchor()` -> `anchorInBox()` (index.html 14259-14307): for a country whose anchor lies outside the
  continent's frame it runs `d3.geoContains(feature, point)` on a 30x30 grid, 900 calls against the whole 50m
  feature, synchronously, inside `placeLearnLabels()` (called from `drawLearnStudy()` / `startLearnLevel()`). Russia's
  50m shape costs ~1.1 ms a call here. The result is cached in `run.anchors`, but the run is made anew by
  `createLearnRun()` every time the ladder is opened, so it is paid once per visit: at Start when Russia is already
  among the names shown, otherwise at the moment the level that adds Russia comes up.
- Evidence: `node learn-cost2.js --size=d1280 --runs=3` (seeds atlas-learn for europe with Russia last in the order;
  out/learn-cost2.log). Level 38 (Russia not yet shown): study view up after 1171-1272 ms, 0 geoContains calls,
  longest task 496-558 ms (the sandbox's CPU-drawn frames). Level 39 (Russia shown): up after 2113-2259 ms, 900
  calls over 961-1072 ms, one task of 1018-1115 ms. `--size=p390 --throttle=4` (CDP CPU throttle x4, a mid-range
  phone): 900 calls over 4347-4617 ms, one task of 4517-4822 ms, study view up after 6.0-6.4 s instead of 1.7 s.
  CPU profile (learn-cost.js, out/learn-cost-d1280.log): anchorInBox 1039 ms inclusive of placeLearnLabels' 1107 ms.
  Africa's ladder also runs it for Cabo Verde (22 ms) and Mauritius (4 ms): cheap, small shapes. No other continent.
- When a zoom settles (the item asked about): nothing is repeated. learn-cost.js: after wheel zooms, 0 geoContains
  calls, placeLearnLabels 0.2-1.6 ms inclusive per ladder (all six continents, every name on the map).
- Fix idea: test the grid against only the polygons of the feature whose bounding box meets the frame box (most of
  Russia's pieces are Arctic islands and Siberia), or against the 110m shape, or ask the engine's own picker; or
  keep the anchors per level key for the visit/page rather than per run; or do the search in idle time before the
  level that needs it.
- [done] Learn label cost (learn-cost.js, learn-cost2.js): F6; nothing repeated when a zoom settles.
- [done] misc.js: (B) a flight to the next country in Capitals of the World is one view change under Reduce motion from
  the OS and from Settings (motion allowed: eased over ~290 ms here); the glide after a drag is switched off in
  `startInertia()` by the same flag (read; a glide could not be produced here even with motion allowed, the
  sandbox's 250 ms frames). (C) the hand cursor is worked out again when the globe turns under a resting mouse.
- [done] frame-play at the sizes the first pass left (out/frame2-p360.log, frame2-t768.log, frame2-d1024.log): pin-europe,
  pin-oceania, pin-world, capitals-europe, name-africa/name-asia, us-state-to-capital at 768x1024 and 1024x768: shown
  places and reveals clear (only the toast over Norway's north, and a city name under the toast for 3 cities);
  p360: pins all seven levels, capitals-africa, capitals-north-america, us-state-to-capital, name-europe: nothing
  beyond F2's corner (Antananarivo, Santo Domingo; pin name labels partly under the controls for 8 cities).
- [running] overlay-cost.js: script per frame of the overlay while a question outlines a large country (d3 path every frame).

### F7 (major) An outlined country is run through a d3 path on every frame: Canada costs ~15 ms of script a frame on a desktop CPU
- Where: `drawMapOverlay()` (index.html 8033-8055) calls the engine's `draw.outline()` (11469-11490) for every entry of
  `map.outlines` on every frame the globe draws; `draw.outline` pushes each part of the 50m feature through
  `d3.geoPath(d3.geoOrthographic().clipAngle(90).precision(0.3))` (rotation, limb clipping, adaptive resampling).
  Outlines that stay for many frames: 'prompt' (the country a Name It / Capitals / States -> Capitals question shows,
  for the whole question), 'learn' (the newest place of a Learn level) and 'reveal' (2.6 s, redrawn every frame for
  its "breathing" alpha, with a 10 px shadowBlur on top).
- Evidence: `node overlay-cost.js` (CDP CPU profile, inclusive time / frames drawn while dragging; out/overlay-cost.log,
  overlay-cost2.log). Name the Countries of the World, practice round of one country, 1280x800, no throttle, per frame:
  Canada (11,573 points) overlay 14.7 ms, all script 15.5 ms; Russia (7,427) 9.6 / 10.4; Indonesia (3,717) 4.7 / 5.6;
  Norway (1,985) 2.4 / 3.5; Chad (291) 0.6 / 1.7. Capitals of the World, Canada: 14.5 / 15.0.
  390x844 with the CPU throttled x4: Canada 75.1 ms overlay (78.2 all script) per frame, Russia 37.3 (40.4), Chad 2.6 (5.7).
  The reveal after a skip in The World (`--level=world --reveal`): Canada 15.2 ms overlay per frame for each of the
  frames of the 2.5 s reveal (18.2 all script), Chad 1.3 (2.6). Learn, Europe with Russia newest (learn-cost.js):
  drawMapOverlay 404 ms over the frames of three zooms, against 21-103 ms on the other continents.
  For comparison the stages' own per-frame figure (0.5-0.9 ms of script) was taken on `?play=world`, which outlines nothing.
- Effect: while such a question is up, turning or zooming the globe cannot hold the display rate even on a desktop
  (15.5 ms of script in a 16.7 ms frame before the engine and the browser do anything), and on a phone it is a few
  frames a second; every missed or skipped large country costs the same for 2.6 s.
- Fix idea: draw these outlines on the GPU with the engine's border lines (a per-feature line style), or give
  `draw.outline` a cheap path while the view is moving (no adaptive resampling, skip parts smaller than a pixel,
  a coarser copy of the rings: the 2D renderer already does this, see the comment at ~10220), and keep the exact one
  for the settled frame.

## Coverage (second reviewer, end)
- [done] overlay-cost.js (F7). The "United States of America" row of overlay-cost2.log is not the
  US: the level's name is "United States", an unknown practice name starts a full round (usa.js: it asked Syria), so
  that row is left out of the evidence.
- Everything in the lens list is now marked; what was not done is listed in the final report's notChecked.
- [done] final report returned by the second reviewer (7 findings: F6, F1, F2, F7 major; F3, F4, F5 minor).
