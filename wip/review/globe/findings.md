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
