# Map port checklist: SVG + d3.zoom → Globe engine

Source file: `/home/user/atlas-game/public/index.html` (8,225 lines; script is 2681–8222).
Engine API: `$S/work/globe/SPEC.md` (`$S` = `/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad`).
"Today" = the code as it stands. "Globe:" = what replaces it. Line numbers are for the file as it stands
at commit `6d9594e`; they shift as soon as you start editing, so work bottom-up or re-grep.

Contents: 0 Read first · 1 Function inventory · 2 Visual states · 3 Per-mode setup · 4 Overlay work ·
5 Dead code and CSS · 6 Subtle behaviours · 7 Acceptance checks

---

## 0. Read first

### 0.1 How this was checked
- Whole script and the map CSS were read. 236 of the line references below were checked by script against
  the expected text of the line (0 mismatches); every cited number was checked to be a real source line.
- Colours, stroke widths and cursors in section 2 are **computed styles read from the running app**
  (Chromium, test harness), not just read off the CSS: `$S/maps/probe/probe2.js`.
- DOM order, eligible counts and hit-zone counts per mode: `$S/maps/probe/probe1.js`.
  Learn labels / pin reveal: `probe3.js`. Container size vs viewBox: `probe4.js`.
  Bugs B4 and B3 reproduced in the running app: `probe5.js`, `probe6.js`.
- Fit zooms quoted in sections 0.3 and 3 were computed with `d3.geoOrthographic` centred on the target's
  spherical centroid, 30 px padding, for 1280×565 and 390×660. The engine's `fitTo` should land close;
  treat them as expectations to compare against, not constants.
- Reference screenshots of today's look: `$S/shots/maps/learn-india-l24.png`, `pin-aim.png`,
  `pin-reveal.png`, `reveal-africa.png`, plus `$S/shots/baseline/*`.
- Not tested: real Esri tiles, the live site, touch devices, WebGL on a real GPU.

### 0.2 Bugs in today's map code. Do not port these
| # | Bug | Evidence | What the port must do |
|---|---|---|---|
| B1 | **Australia is greyed out and never asked.** `featureKey()` (3618–3620) is `'id:' + f.id`, and in `countries-50m.json` Australia and "Ashmore and Cartier Is." both have id `036`. The second overwrites the first in `canonicalByFeature` / `continentByFeature` (3794–3795), so `isEligible(Australia)` is false. World has 183 countries, Oceania 6. | probe1 (`au036: ["country ineligible","country ineligible"]`), baseline screenshots `d-02-world.png`, `d-04-world-sat.png` | Globe layer keys must be unique. Names are unique in every data file (world 50m/110m, US, all four province files), and every 110m name exists in 50m, so `key = 'name:' + featureName(f)` is safe and stable across the 110m→50m swap. Nothing persisted uses `featureKey` (records, focus lists and learn ladders store names). **Side effect:** Australia re-enters the Daily Five tier-1 pool (`generateDailyPuzzle`, 3375–3416), so the daily sequence changes from the deploy day on; World becomes 184, Oceania 7 (new totals vs. stored bests). |
| B2 | The map container changes height **after** `renderMap()` and nothing re-renders (only `window.resize` is observed). Pin mode: 566 → 541 px (second prompt line). States→Capitals: 565 → 454 px (choices panel). Any long prompt that wraps on a phone does the same. The SVG is squeezed by its `viewBox`, the satellite canvas is not, so imagery and borders disagree in those modes. | probe4 | The engine's ResizeObserver fixes drawing. But a `fitTo()` done before the first prompt is laid out is computed for the wrong size (see 6.11). |
| B3 | Rotating the phone during a flash loses the mark: the timeouts at 5256–5262, 5308–5318, 5407–5411, 5453–5457 hold d3 selections of nodes the resize handler has since destroyed. | probe6: resize 0.6 s into a reveal → "Missed 1" but no red country on the map | Marks live in JS state, styles in the engine; nothing to restore. |
| B4 | No delayed callback is cancelled when a game is left. Skip → Esc → start another level within 2.6 s and the stale `nextCountry()` (5317) eats the new game's first question. | probe5: new Asia game's prompt changed from "Northern Cyprus" to "Sri Lanka" with nothing clicked. Timers at 5163, 5169, 5200, 5256, 5266, 5308, 5373, 5407, 5415, 5441, 5453, 5503 | **Worse on a globe:** the world layer persists across games, so a stale `setStyle(key, 'bad')` would paint a country red in the next game. Add a game counter (`state.gameId`, bumped in `startGame` and when leaving for the menu) and make every delayed callback check it. Learn mode already does this for its own runs (5307–5313). |
| B5 | In States→Capitals the prompted state never shows green/red/gold while it is prompted: `.country.prompt-highlight` (1671) comes later in the file than the flash, reveal and completed rules with equal specificity and `!important`, so its fill and stroke win. The green appears only when the next prompt removes the highlight. | probe2 rows `prompt-highlight target-correct`, `… reveal`, `… completed-correct` | Decide deliberately. Recommended: let flash/reveal/mark win over `prompt` (what the code at 5157–5167 clearly meant). |
| B6 | The lighter first keyframe of `flashCorrect` / `flashWrong` (924–933) never shows on countries: the `fill` is `!important`, which beats animations. The fill is the solid colour from the first frame (sampled 0–800 ms). City dots have no `!important`, so their keyframes do run. | probe2 | A "flash" on the globe = solid colour held for the duration. No need to imitate a lighter first frame. |
| B7 | Hover tint uses CSS `:hover`, which sticks on touch screens after a tap. | CSS 757 | Engine `hover` is mouse-only. Gone. |
| B8 | Learn label anchors use only the outer ring (7051), so a province with a hole can be labelled inside the hole. Holes exist in: Moscow Oblast, Krasnodar Krai, Tyumen Oblast, Orenburg Oblast, Tatarstan, Mordovia, Vologda Oblast, Andhra Pradesh. | data scan | Optional fix while re-implementing (4.4). |
| B9 | City dots: hit area is the 6 px circle plus stroke; where dots overlap (New York / Jersey City / Newark / Elizabeth / Yonkers / Paterson) the one later in `US_CITIES_BY_REGION` wins, not the nearest. | code 4977–4992 | Pick the nearest dot within a slop radius (4.2). |
| B10 | Reveal ring and auto-pan use the centroid of the whole feature. For France (with French Guiana, Réunion…) the spherical centroid is 6.7°W 43.0°N, in northern Spain; the planar one today is similarly off. | computed | Use one "anchor" per feature (largest polygon, most-inside point) for rings, labels and `ensureVisible` (4.1). |

### 0.3 Gaps between the engine SPEC and what the game needs. Settle these first
| # | Need | SPEC today | Suggested resolution |
|---|---|---|---|
| G1 | Per-feature **outline** colour/width (flash, reveal, prompt, learn, and the only visible shape in Uncharted) | Style texture is fill only; border colour/width is per layer | Draw the few transient outlines in an overlay callback with `globe.draw.outline()`. Do **not** outline every completed country that way (up to 184 `geoPath` strokes a frame). Drop the per-feature stroke on completed marks; the fill carries it (2.2). |
| G2 | Double-click zoom **off** during play. Today it is disabled on purpose (4861): two quick answer clicks must not jump the view | "Double-click / double-tap: zoom in ×2" always on | Engine option (`dblClickZoom: false`) or a setter. |
| G3 | Zoom range relative to the round. Today `scaleExtent([1, 60])` (4858) is 60× the fitted frame | `maxZoom` only at `create()`, default 80 absolute | Computed orthographic fits (30 px padding, 1280×565 / 390×660): province rounds k≈1.9–6.3, so k=80 leaves 13–43× of zoom-in; **US Northeast k≈10–12, leaving only 7–8×**. Macau at full zoom: 44×91 px today, 18×41 px at k=80 on desktop, 12×28 px on a phone. Create with a larger `maxZoom` (≥ 400) or add `setZoomLimits()` and set `60 × fitK` per round. |
| G4 | Hover and cursor for city dots | `hover` event passes a feature hit only, no x/y | Either skip dot hover (acceptable) or listen to `pointermove` on the host for dots. |
| G5 | Tiny-target picking rules (6.1) | `featureAt` exact hit, else nearest eligible feature under ~14 px within `tolerance` (default 22) | (a) Confirm an exact hit on a **non-eligible** feature is returned (so the game can ignore it) rather than skipped. (b) Today's reach is 11 px from the outline, not 22. (c) Province rounds also treat scattered territories as tiny by **area** (4925–4937); the engine's size test will not catch Andaman & Nicobar or Lakshadweep. Game-side fallback in 6.1. |
| G6 | `fitTo()` with a bare geometry (`MultiPoint` from `pinFitGeometry`, a `LineString`) and with a FeatureCollection | "geojson \| [features]" | Confirm. Never pass a hand-made lon/lat rectangle as a `Polygon`: d3 reads winding order on the sphere and a wrong-way ring means "everything except the box". Use `MultiPoint`. |
| G7 | Imagery retry | "`failed` … stops drawing imagery until re-enabled/retried" | Today a later redraw that finds tiles flips back to satellite automatically (6232–6235), and `sat.failed` is cleared at every game start (4715) and every style toggle (5899). Re-call `setImagery({ enabled: true })` at those two points at least. In the Canvas2D fallback imagery always fails: check `globe.stats().renderer` and lock the satellite switch / Uncharted instead of showing the failure toast every game. |
| G8 | Buttons on top of the map | "Pointer events are handled on the host element" | The zoom buttons, toast, credit and hint pills are children of `.map-wrap` (2551–2568). Give the engine its own child element (`<div id="globe-host">` replacing 2549–2550) so presses on the buttons never reach the engine. |
| G9 | Reuse geometry across games | `setLayers` builds geometry | Build `world` once and keep it; switch modes with `updateLayer(id, { visible, style })` + `setStyles`. Confirm `setLayers` with an unchanged `features` array does not re-triangulate, or never call it twice. |
| G10 | Pulsing reveal (opacity 1 → 0.6 → 1 every 1.2 s for 2.6 s, plus glow) | `flash()` is a single show-then-fade | Game-driven: alternate two styles, or pulse the overlay outline with `globe.animate(2700)`. |
| G11 | `ensureVisible(feature)` for multi-part countries | Uses the feature (bounding cap) | For features whose `featureInfo().radiusDeg` is large, pass the anchor lon/lat instead (B10). Pass the feature itself for small ones so the "zoom tiny features to ~24 px" rule applies. |
| G12 | Clicks by slow tappers | "a tap/click that was not a drag (< 6 px, < 400 ms move)" | Today any press without a drag is a click, however long it is held. Confirm the 400 ms is not a hold limit (kids hold). Also today only the primary mouse button pans (4862). |
| G13 | Reduced motion | Engine handles flights and inertia | The game's own ring and reveal pulses should respect it too (today's CSS animations do not). |

### 0.4 Suggested shape on the game side
- One place that owns the map: `state.globe`, plus plain data the picture is derived from:
  `state.marks` (Map key → `'good' | 'bad'`), `state.cityMarks` (Map city name → same), `state.promptKey`,
  `state.reveal` (`{ key | lonlat, startedAt }`), `state.flashes`, and the existing `state.pin` / `state.learn`.
- One `paintMap()` that sets every feature's style from that data (eligibility → `land`/`dim`, then marks,
  prompt, learn tints). Call it after: game start, the 110m→50m swap, a Learn level start, and whenever
  the globe has been showing something else (review mode after a menu globe). Today this work is spread
  over separate code paths that each set DOM classes.
- Today the DOM is the source of truth for "already answered" (5227–5228, 5386–5387) and for what to
  restore after a resize (7690–7706). Both must read `state.marks` instead.
- d3 pieces that are **not** in the self-hosted bundle (d3-array + d3-geo only): `d3.select/selectAll`
  (4784, 5110, 5114, 5161, 5224, 5299, 5391, 5445, 6875, 6910, 7117), `d3.zoom` / `d3.zoomIdentity`
  (4857, 4885, 5324, 5349, 5467, 5484, 5925, 6011, 6483, 6928, 7636), `.transition()` (5347, 5374, 5482,
  5504, 7632, 7636), `d3.pointer` (6438), and **`d3.polygonArea` (7053) / `d3.polygonContains` (7098)**,
  which are d3-polygon. Replace the last two with ten-line local helpers.
  Still available: `d3.geoDistance` (6469), `d3.geoCentroid`, `d3.geoBounds`, `d3.geoArea`,
  `d3.geoContains`, `d3.geoInterpolate`, `d3.geoPath` (canvas context only).
- Keep the TopoJSON topology objects. Today they are thrown away after `topojson.feature()` (3691, 3736,
  3786); `topojson.mesh(topology, object)` gives each shared border once, which is what the layer's
  `borders` wants. `us-states-detail.json` is plain GeoJSON, so that layer falls back to polygon rings.

---

## 1. Function inventory (everything that touches the map)

"Map state" = `state.svg`, `.projection`, `.pathGen`, `.mapG`, `.zoomBehavior`, `.currentTransform`
(declared 3584–3589), `.zoomHintShown` (3590), `.learnAnchorCache` / `.learnAnchorProjection` (7038–7040).

### 1.1 Data and setup
| Function | Lines | What it does to the map today | Globe replacement |
|---|---|---|---|
| `featureKey` | 3618–3620 | `'id:' + id` else `'name:' + name`; becomes `data-fkey` and every Map key | Layer `key` function. Make it unique (B1). |
| `featureName` | 3622–3625 | Raw name of a feature | Keep. |
| `activeFeatures`, `activeCanonicalByFeature`, `activeFeatureByCanonical`, `currentProvinceStore` | 3595–3615 | Pick the dataset in play | Keep. Add `activeLayerId()` (`'world' \| 'us' \| 'prov'`). |
| `loadWorldData` (+ `TOPO_URLS` 3631–3639) | 3641–3653 | Fetches 50m from two CDNs, falls back to 110m | Self-hosted files. 110m is for first paint only: **never build a queue, a count or the Daily from 110m** (it lacks Cape Verde, Comoros, Mauritius, Bahrain, Antigua and Barbuda, Barbados, Dominica, Grenada, St Kitts, St Lucia, St Vincent). Keep the topology for `mesh`. |
| `loadUsStatesData` (+ `US_TOPO_URLS` 3664–3668) | 3670–3721 | Lazy-loads 51 features (50 states + DC), GeoJSON | Keep; drop CDN fallbacks. After load: register the `us` layer. |
| `loadProvinceData` | 3726–3757 | Lazy-loads one country's TopoJSON | Keep; keep the topology; register / swap the `prov` layer. |
| `ensureTopojson` | 3759–3779 | Loads topojson-client from a CDN if the tag failed | Dead once vendored (calls at 3676, 3731, 3783). |
| `init` | 3781–3816 | Builds feature and lookup tables, then the menu | Also `Globe.create(host, …)` once, `defineStyles`, register `world`. |
| `generateDailyPuzzle` | 3375–3416 | Reads `state.allFeatures` | Not a map call, but it depends on the feature list: 50m only; changes with B1. |
| `startGame` | 4537–4740 | Builds `state.eligibleFeatures` (4615–4690); clears `sat.failed` and calls `applyMapStyle()` **before** the screen switch (4713–4716); shows the zoom hint once per page load (4728–4732); after 80 ms calls `renderMap()` then `startLearnLevel()` or `nextCountry()` (4735–4739) | Same order. `renderMap()` → `setupMap()`. Bump `state.gameId`. Clear `marks`, overlays. Frame the view **after** the first prompt is laid out (6.11). Hint text at 2565 says "drag to pan": reword. |
| `renderMap` | 4773–4996 | Rebuilds the whole SVG. Details in 1.2 | `setupMap()`: layer visibility, `paintMap()`, borders, hover rule, `fitTo`/`setView` + home, overlays. No geometry work. |
| `isEligible` | 5003–5030 | Which features are quiz targets / drawn as land | Keep as is. It is the `eligible` predicate for picking, hover and `land` vs `dim`. |

### 1.2 `renderMap()` in pieces
| Lines | Today | Globe |
|---|---|---|
| 4774–4782 | Measure wrap, set `viewBox`, empty the SVG | Dead. |
| 4788–4801 | `fitCollection` = eligible features (or `pinFitGeometry` for a continent pin round); `bgCollection` = every feature of the dataset | Becomes the `fitTo` target; see section 3 for why raw eligible features are a bad target on a sphere. |
| 4803–4828 | Projection: `geoAlbersUsa` (US), `geoConicEqualArea` with per-country parallels rotated to the round's centroid (province), `geoNaturalEarth1` (World, Daily, pin World), `geoMercator` rotated to the centroid longitude (continents, continent pin) | Dead. One orthographic globe. |
| 4830–4846 | `fitExtent`: US/province inset 40/30 px to eligible; World/Daily inset 20 px to **all** features; continents inset 60/30 px to eligible | `globe.fitTo(target, { padding })`; World/Daily: no fit, home view k=1. |
| 4848–4852 | `state.projection`, `state.pathGen`, `state.mapG` | Dead. `globe.project()` / `globe.invert()`. |
| 4854–4881 | `d3.zoom`: `scaleExtent [1, 60]`; `translateExtent` half a screen past each edge; filter drops `dblclick` and non-primary buttons; on zoom: store transform, move `<g>`, resize city dots (4871–4874), `scaleLearnLabels` (4875), `satOnZoom` (4876), `scalePinMarkers` (4877) | Engine interaction. `translateExtent` has no meaning on a globe. The four per-zoom hooks are dead: overlays redraw every frame from `project()`. G2, G3. |
| 4882–4885 | Reset zoom to identity for every new map | `fitTo(…, { animate: false })` (also sets home) or `setView` + `setHome` at every game start. Not between Learn levels. |
| 4887–4904 | World dataset: `Sphere` path (`.sphere-bg`) + 20° graticule. Other datasets: a huge `.us-ocean` rectangle | Dead. Engine sphere pass; `setGraticule(true)` on parchment, `false` on satellite (today 1059). |
| 4906–4918 | Dashed frames round the Albers Alaska and Hawaii insets (visible on satellite only) | Dead. No insets. |
| 4920–4944 | Hit zones for tiny eligible features: bbox under 14 px at 1×, or (province only) area under 200 px². Invisible 22 px stroke, drawn **under** all polygons | Dead. `globe.featureAt(x, y, { tolerance, eligible })` + the fallback in 6.1. |
| 4946–4960 | One `<path class="country eligible\|ineligible" data-fkey>` per feature, click → `handleCountryClick`. NaN paths from Albers are skipped | Dead. Styles via `setStyles`; one `globe.on('click')` handler. |
| 4962–4967 | Pin mode: `svg.on('click', handlePinClick)` (stays bound on the reused `<svg>` for later games; harmless because `state.pin` is null) + `drawPinLayer()` | The single click handler dispatches by mode. Pin overlay callback. |
| 4969–4993 | us-city: one `<circle class="city-dot" data-city>` per city, radius `6 / k`, click → `handleCityClick` | Overlay dots (4.2). |
| 4995 | `satReset()` | Dead. |

### 1.3 Play
| Function | Lines | What it does to the map today | Globe replacement |
|---|---|---|---|
| `nextCountry` | 5032–5104 | Clears `interactionLocked` (5041, **after** the empty-queue check, so it stays true once a game ends). Pin: resets the guess and `drawPinLayer()` (5055–5057). States→Capitals: `highlightPromptedState` (5086) | Same. Pin: clear guess, `globe.invalidate()`. **Do not move the view to the target** in find-it modes. |
| `highlightPromptedState` | 5109–5116 | Moves `.prompt-highlight` to the prompted state; `ensureFeatureVisible` | `state.promptKey = key; paintMap()` (or `setStyle` old → its mark/`land`, new → `prompt`) + outline; `globe.ensureVisible(feature)`. |
| `handleCapitalChoice` | 5139–5206 | Correct: state gets `.target-correct` for 700 ms, then `.completed-correct` unless hard (5157–5167); next prompt at 1100 ms (5169). Second wrong: `revealTargetFeature` (5193–5197) | `marks.set(key, 'good')` (normal) + `flash`. See B5. |
| `handleCountryClick` | 5208–5292 | Guards in order: pin mode, locked, no current, not eligible, States→Capitals, us-city, already completed (reads DOM classes 5227–5228). Correct: `.target-correct` 900 ms → `.completed-correct` unless hard → `nextCountry` (5245–5262). Wrong: `.target-wrong` 700 ms (5265–5266), not locked; second wrong, or first wrong in Learn (5274): lock + `revealTargetFeature` | `onMapClick` (6.1) → same logic with `state.marks` as the "completed" guard. Correct: normal `setStyle(layer, key, 'good')` at once; hard/Uncharted `flash(layer, key, 'good', 900)`. Wrong: `flash(layer, key, 'bad', 700)`. |
| `revealTargetFeature` | 5297–5319 | `.reveal` for 2600 ms; toast; `ensureFeatureVisible`; `showRevealMarker`; then Learn → `learnLevelFailed()`, else `.completed-wrong` unless hard, then `nextCountry` | Normal: `marks.set(key, 'bad')`, `setStyle(…, 'bad')` first, then `flash(…, 'reveal', 2600)` so it settles on red with no blink. Hard: flash only. Plus outline + rings overlay, `globe.ensureVisible`, `globe.animate(2700)`. |
| `ensureFeatureVisible` | 5322–5350 | No move if the centroid is inside the middle 70 % of the view and k ≤ 1.2; otherwise centres the centroid at the same k over 550 ms | `globe.ensureVisible(featureOrAnchor, { margin })`. G11. |
| `showRevealMarker` | 5354–5376 | Two pulsing rings + centre dot at the centroid, scaled by `1/k`; removed at 2400 ms with a 300 ms fade | Overlay marker (4.1). |
| `handleCityClick` | 5380–5432 | Same flow as countries, on a dot; "completed" guard reads classes (5386–5387) | Dot picking in `onMapClick` (4.2); `state.cityMarks`. |
| `revealMissedCity` | 5436–5458 | Dot `.reveal` 2600 ms, `ensureCoordsVisible`, `showRevealMarkerAtCoords`, then `.completed-wrong` unless hard | Dot state `reveal` in the overlay + the same marker + `globe.ensureVisible(coords)`. |
| `ensureCoordsVisible` | 5462–5485 | Point version of `ensureFeatureVisible` | Merge into one helper. |
| `showRevealMarkerAtCoords` | 5489–5506 | Point version of `showRevealMarker` | Merge into one helper. |
| `handleSkip` | 5508–5556 | Locked/learn-study guards; pin: `pinReveal(null)` in the aim phase only; us-city: `revealMissedCity`; else `revealTargetFeature` | Unchanged logic. |
| `showToast` | 5599–5606 | Toast is a child of `.map-wrap` (2568), z-index 20, shown 1400 ms | Keep it above the engine canvases. |
| `finishGame` | 5608–5764 | Does not touch the map (it stays as it was for View Map). Hides View Map in hard/Uncharted (5758–5761) | Same. Don't tear the globe down here. |
| `switchScreen` | 7582–7592 | Toggles `.active`; inactive screens are `opacity: 0; pointer-events: none`, **not** `display: none` (112–125), so the map keeps its size while hidden | Optionally `globe.pause()` / `resume()`. |

### 1.4 Satellite
| Function | Lines | Today | Globe replacement |
|---|---|---|---|
| `SAT_TILE_URL` | 5858–5860 | Esri World Imagery; note the path is `z/y/x` | Keep; pass as `tileUrl`. |
| `SAT_CREDIT`, `SAT_MAX_ZOOM` | 5861–5862 | Credit text; deepest tile level 15 | Keep. |
| `SAT_GRID`, `SAT_MAX_TILES`, `SAT_CACHE_TILES`, `SAT_SETTLE_MS` | 5863–5866 | Reprojection tuning | Dead. |
| `sat` | 5868–5875 | Tile cache, draw generation, timer, `failed` | Keep only `failed`. |
| `satEnabled` | 5878–5880 | `difficulty === 'uncharted' \|\| mapStyle === 'satellite'` | Keep. |
| `applyMapStyle` | 5883–5892 | `.sat-on` on the wrap when on and not failed; `.no-borders` in Uncharted; button state and title | Rewrite: keep the two classes (they still drive the wrap background 1054, the credit 1147, the hidden style button 1151, cursors), then `defineStyles(palette)`, `updateLayer(…, { bordersVisible, borderColor, borderWidth })`, `setGraticule`, `setTheme`, `setHoverStyle`, `setImagery`. |
| `toggleMapStyle` | 5895–5902 | No-op in Uncharted; flips and saves the style; clears `failed`; redraw | Same, then `applyMapStyle()`. Marks survive because style **names** don't change. |
| `satReset` | 5905–5912 | Clear canvas after a projection change | Dead. |
| `satOnZoom` | 5915–5919 | Follow the gesture, redraw after 160 ms | Dead. |
| `satFollowTransform` | 5922–5930 | CSS-transform the canvas between redraws | Dead. |
| `satRedrawSoon` | 5932–5936 | Debounce | Dead. |
| `satSetLoading` | 5938–5940 | Prefixes the credit with "Loading imagery… · " | Keep; drive from `onStatus('loading' \| 'ready')`. |
| `satTile` | 5943–5977 | Fetch + decode + LRU | Dead. |
| `satRedraw` | 5982–6001 | Plan, draw interim, draw final | Dead. |
| `satPlan` | 6005–6098 | Inverse-project a grid, choose tile zoom and tiles | Dead. |
| `satDraw` | 6102–6238 | Paint pixels. **Keep the behaviour at 6230–6237**: when no imagery at all loaded, set `failed`, `applyMapStyle()`, and toast `Satellite imagery couldn’t load — showing the parchment map` once per transition; flip back when imagery returns | `onStatus('failed')` handler. G7. |
| `loadMapStyle` / `saveMapStyle` | 7339–7351 | `atlas-map-style` in localStorage | Keep. |
| `initModeToggles` | 7359–7377 | Menu difficulty picker and satellite switch (locked on in Uncharted) | Keep. |

### 1.5 Pin the City
| Function | Lines | Today | Globe replacement |
|---|---|---|---|
| `pinFitGeometry` | 6418–6433 | `MultiPoint`: the region's cities plus four corners padded by max(4°, 12 % of the longitude span) and max(3°, 12 % of the latitude span) | Keep; it is a good `fitTo` target as is (G6). |
| `handlePinClick` | 6436–6447 | Aim phase only. `d3.pointer` → `projection.invert` → reject when the point doesn't project back within 1 px (off the edge of the map) → store guess, redraw, enable Drop Pin | From the click event: `if (!lonlat) return; state.pin.guess = lonlat`. The round-trip test is dead (`lonlat` is null off the globe). |
| `handlePinButton` | 6450–6457 | Drop Pin / Next | Keep. |
| `pinReveal` | 6466–6489 | Scores with `d3.geoDistance × 6371`; `drawPinLayer`; pans to the city only if `k > 1.05` (6483–6484) | Keep scoring. Always `globe.ensureVisible(truth)`; better, bring both ends of the miss line into view (4.3). |
| `drawPinLayer` | 6494–6524 | Rebuilds `<g class="pin-layer">`: dashed line, truth marker + label, guess pin, each scaled `1/k`. Called from `renderMap` (4966), `nextCountry` (5057), `handlePinClick` (6445), `pinReveal` (6474) | One overlay callback that reads `state.pin` every frame; the four call sites become `globe.invalidate()`. |
| `scalePinMarkers` | 6527–6532 | Re-applies `1/k` on zoom | Dead. |
| `finishPinGame` | 6535–6629 | Hides View Map (6625) | Unchanged. |
| `setLearnChrome` | 6840–6852 | Also toggles `.pin-mode` and `.pin-hard` on `#game-screen` (6849–6851) | Keep the classes for the cursor; borders come from `updateLayer`. |

### 1.6 Learn mode
| Function | Lines | Today | Globe replacement |
|---|---|---|---|
| `startLearnLevel` | 6863–6899 | Locks interaction for the study phase (6872); wipes every completed/flash/reveal class on every `.country` (6875–6877); `drawLearnStudy`; if `k > 1.05`, `ensureFeatureVisible(newest)` (6893–6897) | `marks.clear(); paintMap()`; always `globe.ensureVisible(newest)`. Keep the view between levels. |
| `drawLearnStudy` | 6902–6914 | `.learn-new` on the newest, `.learn-known` on the rest; `placeLearnLabels` | `setStyles(layer, { key: 'learnNew' \| 'learnKnown' })`, outlines (2.2), lay out labels. |
| `placeLearnLabels` | 6923–7020 | Label layout; see 4.4 | Re-implement against `project()`. |
| `setLearnHint` | 7023–7027 | Shows `#learn-hint`, hides `#zoom-hint` | Keep. |
| `learnLabelAnchor` | 7037–7065 | Largest piece's most-inside point, in projected px at 1×; cache keyed by projection | Re-implement in lon/lat + angular radius; cache per feature for the whole session. |
| `poleOfInaccessibility` | 7069–7113 | Grid search in a planar ring | Keep the search; feed it a local projection; replace `d3.polygonContains`. |
| `clearLearnStudy` | 7115–7120 | Removes tints and labels | `paintMap()` + clear `state.learnLabels`. |
| `scaleLearnLabels` | 7124–7132 | `1/k` on zoom; re-layout 150 ms after the last zoom event | Dead. Re-layout on the engine's `settle` event (same ~150 ms). |
| `beginLearnQuiz`, `learnLevelPassed`, `learnLevelFailed`, `finishLearn` | 7135–7202 | Phase changes; `finishLearn` hides View Map (7193) | Unchanged apart from the calls above. |

### 1.7 Controls
| Code | Lines | Today | Globe replacement |
|---|---|---|---|
| View Map / back to results | 7615–7622 | Add/remove `.review-mode`, switch screens. Nothing is redrawn | Same; see 3.12. |
| `zoomBy` | 7630–7633 | `scaleBy(factor)` over 280 ms | `globe.zoomBy(factor)`. |
| `zoomReset` | 7634–7637 | Back to identity over 380 ms | `globe.resetView()`. |
| Button wiring | 7638–7641 | +, −, reset, map style | Keep. |
| `keydown` | 7643–7671 | See 3.14 | Keep; swap the three zoom calls. |
| `resize` | 7681–7743 | Snapshot marks and transform, `renderMap()`, restore | Almost all dead; see 3.13. |

---

## 2. Visual states

Tokens (`:root`, lines 40–58): `--parchment #f1e7d2`, `--ink #1f2a3a`, `--sepia #6b4423`, `--ocean #a7c0c9`,
`--ocean-deep #7a9ba6`, `--land #f5ebd4`, `--land-border #b29e72`, `--gold #c8953c`, `--gold-bright #e0a84a`,
`--sienna #a0311e`, `--sienna-deep #7d2515`, `--moss #4a6b3c`, `--moss-bright #5f8a4b`.
Colours with **no token today** (give them one, the night theme will need to swap them): `#f0dfb0` hover,
`#ede3cc` ineligible, `#dde8ed` ocean backdrop, `#d0dcc4` prompt, `#ead39a` learn-known, `#6f9c59` / `#b23d28`
completed hover, `#b6dd98` / `#f0a08c` / `#d6f0c0` light outlines, `rgba(255,248,230,·)` satellite borders,
`rgba(16,22,30,0.5)` satellite dim, `rgba(241,231,210,0.22)` satellite hover.

Map styles: **Parchment** (no class) · **Satellite** (`.sat-on`) · **Uncharted** (`.sat-on.no-borders`) ·
**Uncharted, imagery failed** (`.no-borders` only).

### 2.1 Fills → globe style names
Style names are the same in every map style; `defineStyles()` swaps the values (it repaints every feature).

| Globe style | CSS state(s) today | Parchment | Satellite and Uncharted | Kind |
|---|---|---|---|---|
| `land` | `.country.eligible` (747–755) | `rgba(245,235,212,1)` | `rgba(0,0,0,0)` (1062–1066) | Persistent base |
| `dim` | `.country.ineligible` (761–765) | `rgba(237,227,204,0.55)`: `#ede3cc` at element opacity 0.55. Over today's `#dde8ed` backdrop that reads as `rgb(230,229,219)`; if the globe's ocean is darker, use that opaque value instead of the alpha | `rgba(16,22,30,0.5)` (1068–1072) | Persistent base |
| `hover` | `.country.eligible:hover` (757–759) | `rgba(240,223,176,1)` | Satellite `rgba(241,231,210,0.22)` (1067). **Uncharted: none** (1115–1116). Pin mode: none (1750, 1752) | While the mouse is over it |
| `good` | `.target-correct` (781–786) and `.completed-correct` (831–835) | `rgba(95,138,75,1)` | `rgba(95,138,75,0.55)` (1075–1080) | Flash 900 ms (700 ms in States→Capitals); persistent after that in Normal only |
| `bad` | `.target-wrong` (788–793) and `.completed-wrong` (841–845) | `rgba(160,49,30,1)` | `rgba(160,49,30,0.55)` (1082–1087) | Flash 700 ms on a wrong click; persistent after a reveal in Normal only |
| `reveal` | `.country.reveal` (795–802) | `rgba(224,168,74,1)`, whole element pulsing to 60 % opacity (`flashReveal` 935–938, 1.2 s, endless) | `rgba(224,168,74,0.5)` (1089–1093), same pulse | Timed, 2600 ms |
| `prompt` | `.country.prompt-highlight` (1671–1675) | `rgba(208,220,196,1)` | `rgba(208,220,196,0.35)` (1094–1098) | Until the next prompt (States→Capitals only) |
| `learnKnown` | `.country.learn-known` (1680–1684) | `rgba(234,211,154,1)` | `rgba(234,211,154,0.3)` (1708–1712) | While studying |
| `learnNew` | `.country.learn-new` (1685–1689) | `rgba(224,168,74,1)` | `rgba(224,168,74,0.45)` (1713–1717) | While studying |
| `hidden` | (new) | `rgba(0,0,0,0)` | `rgba(0,0,0,0)` | For the parent country in the context layer |

Dropped on purpose: the darker hover on completed features (`#6f9c59` / `#b23d28` at 837–839, 847–849;
`rgba(111,156,89,0.68)` / `rgba(178,61,40,0.68)` at 1081, 1088). The engine has one hover style per layer;
make the hover predicate `eligible && !marks.has(key)` so completed features simply don't react.

Uncharted with imagery failed uses the **parchment** fills with borders off: a plain land silhouette.

### 2.2 Borders and outlines
Layer borders (one colour/width per layer):

| Map style | Active layer | Context / ineligible | Lines |
|---|---|---|---|
| Parchment | `#b29e72`, 0.5 px | same at 55 % (`rgba(178,158,114,0.55)`) | 749–750, 763 |
| Satellite | `rgba(255,248,230,0.7)`, 0.8 px | `rgba(255,248,230,0.25)`, 0.8 px | 1064–1065, 1070 |
| Uncharted (failed or not) | none (`bordersVisible: false`) | none | 1114, 1117 |
| Pin the City, Hard | none, on parchment **and** satellite | none | 1754 |

With one layer for eligible + ineligible features the two can't have different border alphas; accept one colour.
Today every polygon strokes its own outline, so shared borders are drawn twice and look heavier than coasts;
`topojson.mesh` borders will be uniform.

Per-feature outlines today, by state (colour, width in CSS px). Draw the ones marked **overlay** with
`globe.draw.outline()`; skip the rest.

| State | Parchment | Satellite | Uncharted | Uncharted, failed | Globe |
|---|---|---|---|---|---|
| Flash correct | `#4a6b3c` 1 | `#b6dd98` 1.4 | `#b6dd98` 1.6 | `#b6dd98` 1.6 | **overlay** in Uncharted (it is the only edge the shape has); optional elsewhere |
| Flash wrong | `#7d2515` 1 | `#f0a08c` 1.4 | `#f0a08c` 1.6 | `#f0a08c` 1.6 | same |
| Completed correct | `#4a6b3c` 0.5 | `#b6dd98` 1.4 | n/a (no marks) | n/a | skip |
| Completed wrong | `#7d2515` 0.5 | `#f0a08c` 1.4 | n/a | n/a | skip |
| Reveal | `#1f2a3a` 2.5 + glow | `#e0a84a` 2.5 + glow | `#e0a84a` 2.5 + glow | `#1f2a3a` 2.5 + glow | **overlay** |
| Prompt | `#4a6b3c` 2 | `#d6f0c0` 2 | `#d6f0c0` 1.6 | `#4a6b3c` 1.6 | **overlay** |
| Learn known | `#6b4423` 1 | `#ead39a` 1 | `#ead39a` 1 | `#6b4423` 1 | overlay only if cheap (up to 35 outlines); else skip |
| Learn new | `#1f2a3a` 2 | `#e0a84a` 2 | `#e0a84a` 2 | `#1f2a3a` 2 | **overlay** |

Lines: 783–784, 790–791, 797–798, 833, 843, 1078–1079, 1085–1086, 1091–1092, 1096–1097, 1118–1129, 1673–1674,
1682–1683, 1687–1688, 1710–1711, 1715–1716, 1718–1721.
Reveal glow (799–800): `drop-shadow(0 0 10px rgba(224,168,74,0.9)) drop-shadow(0 0 4px rgba(31,42,58,0.5))`.

### 2.3 Timings (from the JS)
| Event | Lines | Clicked feature / dot | Target feature / dot | Locked? | Next prompt |
|---|---|---|---|---|---|
| Correct click, country | 5245–5262 | `good` 0–900 ms, then persistent `good` (Normal) or back to base (Hard, Uncharted) | same feature | Yes | 900 ms |
| Correct click, city dot | 5401–5411 | same, 900 ms | same | Yes | 900 ms |
| Correct capital button | 5157–5169 | n/a | `good` 0–700 ms, then persistent (Normal); B5 | Yes | 1100 ms |
| First wrong click | 5265–5266, 5414–5415 | `bad` 0–700 ms, then back to its base (0.2 s CSS fade, 753) | none | **No** | none |
| Second wrong click; first wrong in Learn | 5274–5286, 5422–5427 | `bad` 0–700 ms | `reveal` 0–2600 ms + marker + pan; then persistent `bad` (Normal), base (Hard), or level restart (Learn) | Yes | 2600 ms |
| Skip | 5516–5551 | none | same reveal | Yes | 2600 ms |
| Target has no feature on the map | 5198–5200, 5439–5441 | none | toast only | Yes | 1800 ms |
| Reveal marker | 5373–5375, 5503–5505 | | rings from 0; removed at 2400 ms with a 300 ms fade | | |
| Auto-pan | 5347, 5482 | | 550 ms | | |
| Zoom buttons / keys | 7632, 7636 | | 280 ms; reset 380 ms | | |
| Toast | 5605 | | visible 1400 ms (0.4 s CSS fade, 1263) | | |
| Learn label re-layout | 7131 | | 150 ms after the last zoom event | | |
| First draw after `startGame` | 4735 | | 80 ms | | |
| Resize debounce | 7742 | | 200 ms | | |
| Zoom hint, Learn hint | 1025, 1028–1032 | | `hintFade` 5 s: in at 0.5–1 s, out from 3.75 s, gone at 5 s | | |

### 2.4 City dots (us-city). No satellite or Uncharted overrides: identical in every map style
Radius 6 CSS px at every zoom (`CITY_DOT_BASE_RADIUS`, 5001), stroke 2 px.

| State | Fill | Stroke | Animation | Kind | Lines |
|---|---|---|---|---|---|
| Default | `#1f2a3a` | `#f1e7d2` | fill fades over 0.18 s | Persistent | 857–864 |
| Hover | `#e0a84a` | `#1f2a3a` | | Mouse over | 866–869 |
| Flash correct | `#5f8a4b` | `#4a6b3c` | fill from `#9ec97f` over 0.5 s | 900 ms | 871–875, 909–912 |
| Flash wrong | `#a0311e` | `#7d2515` | fill from `#c94f3c` over 0.4 s | 700 ms | 877–881, 914–917 |
| Completed correct | `#5f8a4b` | `#4a6b3c` | hover `#6f9c59` | Persistent, Normal only | 883–891 |
| Completed wrong | `#a0311e` | `#7d2515` | hover `#b23d28` | Persistent, Normal only | 893–901 |
| Reveal | `#e0a84a` ↔ `#c8953c` | `#6b4423` | 0.7 s each way, endless | 2600 ms | 903–907, 919–922 |

### 2.5 Backdrop and chrome
| Thing | Parchment | Satellite / Uncharted | Lines | Globe |
|---|---|---|---|---|
| Wrap background | two faint radial gradients of `rgba(167,192,201,·)` over the page | `var(--ink)` | 731–733, 1054 | Keep on `.map-wrap`; it shows outside the globe's halo. |
| Ocean | `#dde8ed` (`.sphere-bg`, `.us-ocean`) | none (imagery) | 949–954, 1821–1823, 1058, 1060 | `theme.ocean`. SPEC default is `#a7c0c9`, darker than today. Design decision. |
| World outline | `#7a9ba6` 0.5 px | `rgba(241,231,210,0.35)` | 951–952, 1058 | `theme.limb`. |
| Graticule | `rgba(122,155,166,0.25)`, 0.4 px, dashed 2 2, every 20°; world dataset only | hidden | 940–947, 4894, 1059 | `theme.graticule`; `setGraticule(!satellite)`. On in US and province rounds too (it is a globe now). |
| Cursor | `grab` on the map (`grabbing` while pressed), `pointer` on eligible features and dots, `default` on ineligible and completed | Uncharted and Pin: `crosshair` everywhere | 740, 744, 754, 764, 834, 844, 862, 1113–1114, 1745–1746 | Host cursor by CSS class; set `pointer` from the `hover` event when `eligible && !marked`. |
| Imagery credit | hidden | shown bottom right, 10 px Crimson Pro, `rgba(241,231,210,0.75)` on `rgba(31,42,58,0.55)`, z-index 2 | 1132–1147, markup 2566 | Unchanged; must stay above the canvases. |
| Map style button | shown | hidden in Uncharted | 1150–1151, markup 2561–2563 | Unchanged. |
| Stacking | SVG < credit (2) < zoom buttons (11) < toast (20); hint pills have no z-index (DOM order puts them above the SVG) | satellite canvas (0) < SVG (1) | 964, 1051, 1056, 1136, 1264 | Engine canvases must sit below all of these. |

---

## 3. Per-mode setup

### 3.0 Layer plan (recommended)
| Layer id | Features | Borders | Built |
|---|---|---|---|
| `world` | All world features (241 in 50m; 177 in 110m for first paint only) | `topojson.mesh(topology, topology.objects.countries)` | Once at init; `updateLayer('world', { features, borders })` when 50m arrives |
| `us` | 51 features of `us-states-detail.json` (50 states + District of Columbia) | polygon rings (no topology) | On first US game |
| `prov` | One country's provinces: Canada 13, China 33, India 36, Russia 83 | `topojson.mesh` of that file | On first play of each country; swap with `updateLayer('prov', { features, borders })` then `resetStyles` (keys differ per country) |

Draw order `world`, `us`, `prov`; toggle `visible`. In US and province rounds `world` stays visible as a
non-interactive **context** layer in `dim`, which is new: today those rounds float on a blank ocean rectangle.
- The parent country in `world` lies under the active layer. On parchment leave it `dim` (the opaque active
  layer covers it; any sliver from mismatched coastlines is dim land, not sea). On satellite / Uncharted set
  it to `hidden`, or its dark `dim` shows through the see-through fills.
- China: the world file has separate features named `Hong Kong` and `Macao`, and both are also provinces in
  the province file. Treat them like the parent. `Taiwan` stays as context, matching the border choice in
  CLAUDE.md.
- Russia: the world file's Russia **includes Crimea**; the province file leaves Crimea and Sevastopol out.
  If world-Russia is hidden, Crimea is drawn as sea. With the rule above it is dim land on parchment and
  untinted imagery on satellite. Look at a screenshot of `russia-south` in both.

### 3.1 world-country, "World"
- Today: all 241 features drawn; 183 eligible and 58 not (184 and 57 once B1 is fixed). Context includes Greenland,
  Antarctica, Puerto Rico, Singapore, Malta, Maldives, Andorra, Hong Kong. Natural Earth projection fitted
  to **everything** with 20 px padding (4818–4821, 4836–4840). Sphere + graticule. 58 hit zones at 1280×565.
  Everything is on screen at 1×.
- Globe: `world` interactive; eligible → `land`, rest → `dim`. No fit: home view `{ k: 1 }` centred somewhere
  neutral (suggest lon 15, lat 20). Half the world is out of sight; **the player rotates to find the target.**
  Do not turn the globe toward the answer on a prompt. Turn only on a reveal (`ensureVisible`).

### 3.2 world-country, one continent
- Today: all 241 drawn; the continent's countries eligible, the rest dim. Mercator rotated to the centroid
  longitude of the eligible set, fitted to the eligible set with 60/30 px padding (4822–4827, 4841–4845).
- Flat-map problem that gets worse on a sphere: fitting to the raw features drags in overseas territories and
  all of Russia. Europe's eligible set runs from 68°W (Bonaire, Netherlands) east to 170°W (Chukotka) and from
  21°S (Réunion, France) to 82°N; its spherical centroid is 68°E 68°N
  (Siberia) with points up to 100° away. `fitTo(eligibleFeatures)` would centre on Siberia. Today's Europe map
  is nearly the whole northern hemisphere (`$S/shots/baseline/d-03-europe.png`). Same effect, milder, from
  the USA's Aleutians and Hawaii, Chile's Easter Island, France, the Netherlands, Norway, Portugal, Spain.
- Globe: `world` interactive, same styles. Fit to a **curated frame per continent**, passed as a `MultiPoint`
  of the box corners and edge midpoints. Starting values to tune by eye:

  | Continent | Longitude | Latitude | Box fits at: centre, k desktop / phone | Raw eligible set: centroid, farthest point |
  |---|---|---|---|---|
  | Africa | 20°W – 53°E | 36°S – 38°N | 16.4°E 1.2°N, 1.6 / 1.5 | 18.7°E 6.5°N, 56° |
  | Asia | 26°E – 146°E | 11°S – 55°N | 86.0°E 33.1°N, 1.4 / 1.1 | 85.0°E 33.6°N, 68° |
  | Europe | 25°W – 45°E | 34°N – 72°N | 10.0°E 56.9°N, 2.5 / 1.9 | 68.2°E 67.8°N, 100° (unusable) |
  | North America | 170°W – 52°W | 7°N – 72°N | 111.0°W 52.7°N, 1.4 / 1.1 | 99.9°W 49.1°N, 54° |
  | South America | 82°W – 34°W | 56°S – 13°N | 58.0°W 22.7°S, 1.7 / 2.3 | 60.5°W 14.1°S, 47° |
  | Oceania | 112°E – 180° | 48°S – 0° | 146.0°E 27.1°S, 2.1 / 1.6 | 136.2°E 25.3°S, 52° |

  Russia then runs off toward the limb in the Europe round; it is still clickable where visible.
  Asia and North America end up close to the whole-globe view (k≈1.1–1.4): wide continents are
  foreshortened at their edges on a sphere, so expect players to turn the globe there.

### 3.3 daily-five
- Today: identical map to World (4818, 4836); every country with a continent is clickable (5027); the queue is
  the day's five in fixed order (4616–4628). A daily replay (`opts.dailyReplay`) is the same map.
- Globe: same as 3.1.

### 3.4 us-state and us-capital-to-state
- Today: 51 features; 50 eligible, DC ineligible (dim, not clickable). `geoAlbersUsa` fitted to the 50 states
  with 40/30 px padding; Alaska and Hawaii are **insets** under the south-west. Ocean rectangle, no graticule.
  Dashed inset frames on satellite. No hit zones at 1280×565.
- Flat-only: the insets and their frames (4906–4918, CSS 1101–1111), the NaN-path filter (4947–4958), the
  special cases for Albers in the satellite code (6013–6021).
- Globe: `world` context (`dim`, USA `dim`/`hidden` per 3.0) + `us` interactive; 50 states `land`, DC `dim`.
  Alaska and Hawaii sit where they really are: Anchorage is 39° and Honolulu 55° from the middle of the
  lower 48. Do not `fitTo` the 50 state features (the Aleutians cross 180°). Two workable frames, as
  `MultiPoint` boxes; **pick one and look at it on both screen shapes**:
  - Lower 48 (125°W–66.5°W, 24°N–49.5°N): k≈3.6 on 1280×565, k≈2.1 on 390×660. On the desktop shape both
    Alaska and Hawaii are off screen (Anchorage above the top edge, Honolulu past the left edge); on the
    phone shape Alaska is in view and Hawaii is not. "Find Hawaii" then means turning the globe.
  - All 50 (add points for mainland Alaska and Hawaii): k≈2.2 desktop, k≈1.3 phone, centred 119°W 48°N.
    Everything in view, lower 48 about 40 % smaller.

### 3.5 us-state-to-capital
- Today: same map as 3.4. The map is **not clickable** (5215); the answer is one of four buttons. The prompted
  state carries `.prompt-highlight` and is panned into view (5109–5116). The choices panel shrinks the map
  after it was drawn (B2). Polygons still show the hover tint and pointer cursor although they do nothing.
- Globe: same layers, `prompt` style + outline on the prompted state, `globe.ensureVisible(state)` on every
  prompt (allowed here: the state is the question, not the answer). No hover style.

### 3.6 us-city (only Northeast is enabled)
- Today: 51 state features; the region's states eligible (`land`), the rest dim; polygons are not clickable
  (5218) but still tint on hover. Albers USA fitted to the region's states. 40 dots on top (Northeast).
  The prompt reads "City, State".
- Globe: `world` context + `us` (not interactive, no hover); region states `land`, others `dim`. Fit to the
  region's state features (Northeast is compact). For the West, when it is enabled, fit to the cities'
  bounding box instead (Alaska and Hawaii). Dots are an overlay (4.2).

### 3.7 province (Canada, China, India, Russia ×3)
- Today: the whole country's features drawn. Whole-country rounds: all eligible. Russia rounds: one `group`
  eligible (29 / 27 / 27), the other 54–56 dim. Equal-area conic with per-country parallels
  (`PROVINCE_COUNTRIES[*].parallels`, 3228, 3234, 3240, 3246), rotated to the round's centroid, fitted to the
  round with 40/30 px padding. Ocean rectangle, **no neighbouring countries**. Hit zones: bbox under 14 px or
  area under 200 px² (India 8: Sikkim, Dadra and Nagar Haveli and Daman and Diu, Goa, Puducherry, Lakshadweep,
  Andaman and Nicobar Islands, Delhi, Chandigarh. Russia West 2: Saint Petersburg, Moscow).
- Flat-only: the conic parallels and the comment that explains them (3211–3215).
- Globe: `world` context + `prov` interactive. `fitTo(eligible features)` works here: farthest point from the
  centroid is 28.5° (Canada), 25.6° (China), 21.1° (India), 20.7° / 11.2° / 30.4° (Russia W / S / E; East
  crosses 180°, the spherical centroid copes). Expected fit, k desktop / phone: Canada 2.4 / 2.0, China
  3.1 / 2.4, India 3.7 / 3.4, Russia West 2.8 / 4.2, South 5.1 / 6.3, East 2.8 / 1.9.

### 3.8 province, Learn mode
- Today: same map as 3.7. Study phase: interaction locked (zoom and pan still work, that is how hidden names
  are read), tints + labels, "Quiz Me" / Enter. Quiz phase: normal clicking; one miss or skip restarts the
  level; marks accumulate in Normal and are wiped at each level start (6875–6877). View is kept between levels.
- Globe: same as 3.7 plus the label overlay (4.4). No hover during study.

### 3.9 city-pin
- Today: `world` features as scenery: the region's countries `land`, the rest dim (World: every country with
  a continent). Continent rounds: Mercator fitted to `pinFitGeometry(region)`; World: Natural Earth fitted to
  everything. A click anywhere on the map, land or sea, sets the guess (4962–4967). No hover tint, crosshair
  cursor. Hard: no borders (parchment or satellite). Uncharted: satellite, no borders. Hit zones are still
  built and do nothing.
- Globe: `world`, not interactive, no hover. Continent: `fitTo(pinFitGeometry(region))`. World: home view.
  A tap in space (off the globe) gives `lonlat === null`: ignore it.

### 3.10 Uncharted and Hard, any mode
- `state.hardMode` is true for both (7336). No persistent marks (5165, 5258, 5314, 5409, 5455). View Map hidden.
- Uncharted: satellite forced on (5879), borders off, no hover, crosshair, style button hidden. The dark `dim`
  on ineligible features **stays**, so the outer edge of the region is visible; only inner borders are hidden.

### 3.11 Focus practice (`opts.practice`)
- Today: the map is exactly the full level's (4692–4702 only shortens the queue). Everything eligible stays
  clickable and land-coloured. No records.
- Globe: nothing special.

### 3.12 Review mode (View Map)
- Today: adds `.review-mode` to `#game-screen` (7615–7618). Hidden: stats, prompt panel, controls, hint pills,
  the Atlas back button (1162–1168). Still shown: the map with its marks and current zoom, zoom buttons
  including the style button, the imagery credit. Nothing is redrawn. The map is inert only because
  `interactionLocked` is still true from the last answer (5041 comes after the empty-queue return). Offered
  in Normal only (5760); never after Pin (6625) or Learn (7193). Escape leaves the class on; `startGame`
  removes it (4541).
- Globe: nothing to restore **as long as the globe still holds the finished game**. If the same engine is
  moved elsewhere in between (`attachTo` for a menu globe), View Map must put back layers, `paintMap()`, dots,
  view and imagery. Add an explicit `state.review` guard instead of relying on the leftover lock.

### 3.13 Resize handler (7681–7743)
- Today: 200 ms debounce; only when the game screen is active and a map exists. Snapshots keys carrying
  `.completed-correct`, `.completed-wrong`, `.prompt-highlight` and dots carrying the two completed classes,
  plus the zoom transform; `renderMap()`; re-applies them; redraws the Learn study; restores the transform (in
  old pixel units, so the framing is only roughly kept). Not restored: a flash or reveal in progress, the
  reveal marker (B3).
- Globe: the engine resizes itself and the view is `{ lon, lat, k }`, so marks and framing survive. What is
  left for the game: (1) if the player has not moved the view since the last fit, fit again for the new shape
  and `setHome`; (2) lay out the Learn labels again (call the layout from the resize path; do not assume the
  engine emits `settle` on a resize).

### 3.14 Keyboard (7643–7671; game screen active; ignored while typing in an input)
| Key | Today | Globe |
|---|---|---|
| Enter | Learn study → `beginLearnQuiz()`; Pin → `handlePinButton()` | Same |
| S | `handleSkip()` | Same |
| + or = | `zoomBy(1.6)` | `globe.zoomBy(1.6)` |
| - or _ | `zoomBy(1 / 1.6)` | `globe.zoomBy(1 / 1.6)` |
| 0 | `zoomReset()` | `globe.resetView()` |
| M | `toggleMapStyle()` | Same |
| Escape | `switchScreen('menu')` | Same; bump `state.gameId` (B4) |

All of these also work in review mode (S does nothing there because of the lock).

### 3.15 Things that only made sense on a flat map
| Thing | Lines | Replaced by |
|---|---|---|
| Albers USA insets and their dashed frames | 4808, 4906–4918; CSS 1101–1111 | True positions; home frame on the lower 48 |
| `translateExtent` | 4859 | Nothing |
| `scaleExtent [1, 60]` relative to the fitted frame | 4858 | Engine `minZoom` / `maxZoom` (G3). Zooming out past the round's frame is now possible |
| `.sphere-bg` and `.us-ocean` backdrops | 4887–4904; CSS 949–954, 1058, 1060, 1820–1823 | Engine sphere pass |
| Conic parallels per country | 3228, 3234, 3240, 3246; 4809–4817; comment 3211–3215 | `fitTo` on the globe |
| Mercator rotated to the centroid longitude | 4822–4827 | `fitTo` |
| Counter-scaling by `1/k` | 4871–4877, 4976, 4990, 5362–5367, 5495–5499, 6498–6499, 6527–6532, 6944, 7124–7129 | Overlay drawn in screen px from `project()` |
| `viewBox` + `preserveAspectRatio` | 2550, 4779 | Engine canvases |
| NaN paths outside the Albers frame | 4932–4933, 4954–4958 | Nothing |
| Hit zones sized at 1× when the map is built | 4924–4944 | `featureAt` (sizes are live) |
| Round-trip test for clicks off the map edge | 6441–6443 | `lonlat === null` |
| Unwrapping longitudes round the projection centre; Albers exceptions | 6013–6021 | Engine shader |
| Label-anchor cache keyed by projection | 7038–7041 | Cache per feature |
| Saved transform in pixels | 7708, 7738–7741 | View in degrees |
| "At 1× everything is on screen" (`k <= 1.05` / `k <= 1.2` tests) | 5340–5343, 5477–5478, 6483–6484, 6893–6897 | Always call `ensureVisible`; it does nothing when the target is comfortably in view |
| "Scroll to zoom · drag to pan" | 2565 | "drag to turn the globe" wording |

---

## 4. Overlay work

Everything here is drawn in `globe.addOverlay((ctx, g) => …)` callbacks from game state, in this order
(bottom to top): feature outlines → city dots → pin line, truth, guess → Learn dots and names → reveal rings.
Today's order inside the zoomed `<g>` is: backdrop → hit zones → countries → pin layer → city dots, then
whatever was appended later (reveal marker, Learn labels).
Skip anything whose `project()` result has `visible === false`.

### 4.1 Reveal marker (rings)
- Today (5354–5376, 5489–5506; CSS 804–828): at the feature's projected centroid, or a city's coordinates.
  Only one at a time (any earlier one is removed first, 5360, 5494).
  - Two rings: radius 6 → 42 px while opacity 0.95 → 0, 1.4 s, ease-out, endless; the second starts 0.45 s
    later. Stroke 3 px; first ring `--ink`, second `--gold-bright`; **both `--parchment` on satellite** (1099).
  - Centre dot: radius 5, fill `--ink`, stroke `--gold-bright` 2 px.
  - Lifetime: 2400 ms, then a 300 ms fade.
- Globe: `state.reveal = { lonlat, startedAt }`; in the overlay compute `t = ((now - startedAt) % 1400) / 1400`
  and call `globe.draw.rings(ctx, lonlat, { t, color })` for each ring (second one offset by 450 ms), draw the
  dot, fade the last 300 ms. `globe.animate(2700)` keeps frames coming. Clear it when the game changes (B4).
- Position: use the feature **anchor** (largest polygon's most-inside point, the same one Learn labels use),
  not the centroid (B10). Same anchor for `ensureVisible` on big multi-part features (G11).

### 4.2 City dots
- Today: section 2.4 for the look; `<circle>` per city in the zoomed group, kept 6 px by dividing by k.
- Globe overlay: for each city `p = g.project(coords)`; skip if not visible; draw a 6 px disc with a 2 px
  stroke in the colours of its state: `default`, flash `good` (900 ms) / `bad` (700 ms), marked `good` / `bad`
  (`state.cityMarks`, Normal only), `reveal` (2600 ms, alternating `#e0a84a` and `#c8953c` every 0.7 s; needs
  `globe.animate`).
- Picking (replaces the per-circle click, 4992): on a map click in us-city, project every city, take the
  **nearest** within a slop radius (suggest 12 px for a mouse, 18–22 px for touch via
  `originalEvent.pointerType`); ignore marked dots (5386–5389); then the logic of `handleCityClick`.
  A click that hits no dot does nothing (state polygons are never targets in this mode).
- Hover (866–869): needs pointer coordinates (G4). Acceptable to drop.

### 4.3 Pin the City
All from `state.pin` (`phase`, `guess`) and the current city, as today (6494–6524). Screenshot:
`$S/shots/maps/pin-reveal.png`.
- **Guess pin** (whenever `guess` is set; aim and reveal phases): teardrop with its tip on the point, path
  `M0,0 C-2,-6 -8,-10 -8,-16 A8,8 0 1 1 8,-16 C8,-10 2,-6 0,0 Z` (16 px wide, 24 px tall), fill `--sienna`,
  stroke `--parchment` 1.5 px; inner disc at (0, −16) radius 3, fill `--parchment` (1763–1768).
  `new Path2D(thatString)` draws it on the canvas unchanged.
- **Truth marker** (reveal phase): ring radius 9, stroke 2 px `--ink` (`--parchment` on satellite, 1799), no
  fill; dot radius 4, fill `--gold-bright`, stroke `--ink` 1.5 px; label = city name centred 14 px above the
  point, Cormorant Garamond 700 16 px, fill `--ink`, 3 px `--parchment` halo drawn under the fill (1769–1788).
- **Miss line** (reveal phase, only when there was a guess): great-circle path from guess to truth, 1.5 px,
  dashed 5 4, `--ink` (`--parchment` on satellite, 1798). Today `pathGen` on a `LineString` (6506–6508).
  Globe: `globe.draw.geoLine(ctx, guess, truth, { … })`; it clips at the limb.
- Draw order: line, truth, guess on top (6503–6523). The label has no collision handling.
- After a reveal today the view moves only if zoomed in (6483–6484), because on a flat map both ends are
  always on screen. On a globe a far-off guess can be behind the limb: after the reveal, bring both ends into
  view when they are less than ~120° apart (`fitTo` the two points, capped at the current zoom), else
  `ensureVisible(truth)`.
- New city: guess cleared (5056), Drop Pin disabled until a tap. Taps count only in the aim phase (6437).

### 4.4 Learn-mode labels: the algorithm, exactly (6923–7020, 7037–7113)
Screenshot of the result: `$S/shots/maps/learn-india-l24.png` (India, level 24: 24 names, 18 of them dotted).

**Anchor per province** (`learnLabelAnchor`):
1. Take each polygon's **outer ring only**. Project it. Area = absolute planar area of the projected ring.
2. Keep the ring with the largest area (the "largest piece").
3. `poleOfInaccessibility(ring)`:
   - Bounding box of the ring. `edgeDist(x, y)` = shortest distance from the point to any segment of the ring,
     closing segment included.
   - Coarse pass: a 25 × 25 grid of points over the box (`n = 24`, both edges included). Skip points outside
     the ring. Keep the point with the largest `edgeDist`.
   - If no grid point is inside: return null.
   - Two refinements: 9 × 9 grid (`n = 8`) over `best ± step`, first with `step = max(box width, box height) / 24`,
     then with `step / 4`.
   - Result `{ x, y, radius }` where `radius` is the winning `edgeDist` (how much clear room surrounds the point).
4. If there is no usable ring or the search returned null: the feature's centroid with `radius = 0`.
5. Cached per feature (today per projection object, since a resize rebuilds the projection).

**Layout** (`placeLearnLabels`; only in the study phase; all boxes are in **screen px**):
1. Names = `run.order.slice(0, run.level)` reversed, so the newest is first.
2. Per name: measure the text. Regular 13 px weight 600; the newest 16 px weight 700 (1690–1705). Measured
   today: height 16 px and 20 px. `w = textWidth + 8` (room for the halo), `h = textHeight + 2`.
   `(sx, sy)` = anchor on screen. `room = radius × k × 2`, the clear diameter round the anchor in screen px.
   **`fits = room >= h × 1.2 && room >= w × 0.6`.**
3. Order: the newest first, then the ones that fit, then the ones that don't (stable sort, 6962).
4. `placed = []`. Before any text: for every name that does **not** fit, reserve its dot box
   `[sx − 5, sy − 5, sx + 5, sy + 5]` (6966–6968), so no name can cover another's dot.
5. Costs: `overlapArea(box)` = total intersection area with everything in `placed`.
   `offscreen(box)` = `(left overhang + right overhang) × box height + (top overhang + bottom overhang) × box width`
   against the view (6975–6976), so names stay on screen.
6. Per name, in order. A candidate box is `w × h` centred at `(sx + dx, sy + dy)`. `gapX = w/2 + 6`,
   `gapY = h/2 + 4`. Candidates, in this order:
   - only if it fits: `(0, 0)`, on the province, no dot;
   - then, each with a dot at the anchor: right `(gapX, 0)`, left `(−gapX, 0)`, above `(0, −gapY)`,
     below `(0, gapY)`, upper right, upper left, lower right, lower left.
   - `cost = overlapArea(box) + offscreen(box)`, plus `overlapArea(dotBox)` when this is a dotted position for
     a name that fits (its dot was not reserved in step 4).
   - The first candidate with cost exactly 0 wins. If none, the lowest cost wins (first one on ties).
7. If the chosen cost is more than **20 % of `w × h`** and it is not the newest name: leave the name off. If its
   anchor is on screen, count it as hidden. Its reserved dot box, if any, stays in `placed`.
   **The newest name is always placed**, whatever it costs.
8. Otherwise draw the text centred at `(sx + dx, sy + dy)` (centre and middle aligned). If the position needs
   a dot: a disc at the anchor, radius 4 for the newest, 3 for the rest, fill `--ink`, stroke `--parchment`
   1.5 px (1722–1727); if the name fitted, add its dot box to `placed` now. Add the text box to `placed`.
9. The newest label is drawn last, on top (7018).
10. Show the "Zoom in to see every name" pill when the hidden count is above 0 (4.5).

Text style: Cormorant Garamond, fill `--ink`, 3 px `--parchment` stroke **under** the fill (`paint-order: stroke`).
The same on satellite and Uncharted (no overrides).

Quirk to keep or fix knowingly: for a name that does not fit, the "above" and "below" boxes start 4 px from
the anchor and its own reserved dot box reaches 5 px, so those two candidates always cost at least 10 px² and
are never a clean first choice; the six positions with a horizontal offset clear the dot. Using `gapY = h/2 + 6`
removes the bias.

**When it runs today:** on entering a study level (6913), 150 ms after the last zoom event (7130–7131), after a
resize (7726). Between layouts the labels ride along with the map: each label keeps its offset from its anchor.

**Re-implementing against `project()`:**
- The orthographic picture changes shape as the globe turns, so anchors cannot live in projected pixels.
  Compute each anchor once in a small local projection centred on the largest polygon (for example
  `d3.geoAzimuthalEqualArea().rotate([-lon0, -lat0]).translate([0, 0]).scale(1)`: units are radians near the
  centre), run the same grid search
  there, convert the best point back with `invert`, and store `{ lonlat, radiusRad }`. Largest polygon by
  `d3.geoArea`. This also removes the per-projection cache.
- At layout time: `p = globe.project(lonlat)`; if not visible, skip the name (and don't count it as hidden);
  `room = 2 × radiusRad × globe.radiusPx()` (multiply by the cosine of the angle from the view centre if you
  want to allow for foreshortening near the limb).
- Measure with `ctx.measureText` after `document.fonts.ready`; today's 16 / 20 px heights are a fair constant.
- Store per label `{ name, lonlat, dx, dy, dot, isNew }`. Draw every frame at `project(lonlat) + (dx, dy)`;
  recompute `dx, dy, dot` and the hidden count on `settle` and when the level changes.
- `d3.polygonArea` and `d3.polygonContains` are not in the vendored bundle (0.4).
- Optional fix for B8: count hole rings as edges and reject points inside a hole.

### 4.5 "Zoom in to see every name" hint
- Markup 2567 (`#learn-hint`, class `zoom-hint`, hidden by default); `setLearnHint` 7023–7027.
- It shares `.zoom-hint`, so it plays the 5-second `hintFade` (1025–1032) each time it goes from hidden to
  shown, then stays invisible until it has been hidden and shown again. Showing it hides `#zoom-hint` (7026).
  Hidden in review mode (1165). Cleared when the study phase ends (7116).
- Globe: same element, driven by the new layout's hidden count. Names behind the globe are not "hidden".

### 4.6 Feature outlines
The table in 2.2. Keep a small list `{ key, stroke, width, glow, until }` and draw each with
`globe.draw.outline(ctx, feature, { stroke, width })`. In Uncharted this outline (with the fill) is the whole
"a shape shows only once you answer" effect, so it is not optional there.

---

## 5. Dead after the port

### 5.1 JavaScript
| What | Lines |
|---|---|
| Full d3 bundle and topojson from cdnjs (replace with the vendored files) | 2679–2680 |
| `parallels` in `PROVINCE_COUNTRIES`; the comment on conic projections | 3228, 3234, 3240, 3246; 3211–3215 |
| State fields `svg`, `projection`, `pathGen`, `mapG`, `zoomBehavior`, `currentTransform` | 3584–3589 |
| `TOPO_URLS` and the CDN loop in `loadWorldData` | 3631–3639, 3641–3653 |
| us-atlas CDN fallbacks and the TopoJSON branch for them | 3666–3667, 3689–3691 |
| `ensureTopojson` and its three calls | 3759–3779; 3676, 3731, 3783 |
| `renderMap` (whole function) | 4773–4996 |
| Comment above `CITY_DOT_BASE_RADIUS` (keep the constant) | 4998–5000 |
| `ensureFeatureVisible`, `ensureCoordsVisible` (one small helper instead) | 5322–5350, 5462–5485 |
| `showRevealMarker`, `showRevealMarkerAtCoords` (one overlay marker instead) | 5354–5376, 5489–5506 |
| Every `d3.select(...).classed(...)` | 5110, 5114, 5161–5166, 5224–5230, 5245, 5257–5260, 5265–5266, 5299–5300, 5309, 5315, 5391, 5401, 5408–5409, 5414–5415, 5445–5446, 5454–5455, 6875–6877, 6910–6911, 7117–7118 |
| Satellite section comment (rewrite) | 5842–5856 |
| `SAT_GRID`, `SAT_MAX_TILES`, `SAT_CACHE_TILES`, `SAT_SETTLE_MS` | 5863–5866 |
| `sat.tiles`, `.drawnAt`, `.timer`, `.gen`, `.scratch` (keep `.failed`) | 5869–5874 |
| `satReset`, `satOnZoom`, `satFollowTransform`, `satRedrawSoon` | 5905–5936 |
| `satTile`, `satRedraw`, `satPlan`, `satDraw` (keep the meaning of 6230–6237) | 5943–6238 |
| Body of `handlePinClick` | 6438–6443 |
| Body of `drawPinLayer`; `scalePinMarkers` | 6494–6524; 6527–6532 |
| Body of `placeLearnLabels` and `learnLabelAnchor`; `state.learnAnchorProjection` | 6923–7020, 7037–7065 |
| `scaleLearnLabels` | 7124–7132 |
| Bodies of `zoomBy`, `zoomReset` | 7630–7637 |
| Resize handler | 7673–7743 |

### 5.2 CSS
| What | Lines |
|---|---|
| `#world-map` (move the cursors to the globe host) | 736–745 |
| `.country`, hover, `.ineligible` | 747–765 |
| `.country-hitzone` and its comment | 767–779 |
| `.target-correct`, `.target-wrong`, `.reveal` | 781–802 |
| `.reveal-marker` rules, `@keyframes revealPulse` | 804–828 |
| `.completed-correct`, `.completed-wrong` and hovers | 830–849 |
| `.city-dot` rules and `@keyframes dotFlashCorrect`, `dotFlashWrong`, `dotPulseReveal` | 851–922 |
| `@keyframes flashCorrect`, `flashWrong`, `flashReveal` | 924–938 |
| `.graticule`, `.sphere-bg` | 940–954 |
| `.sat-canvas` (rewrite the comment 1034–1041 for the new setup) | 1042–1052 |
| `.sat-on .sat-canvas`, `.sat-on #world-map`, `.sat-on .sphere-bg`, `.graticule`, `.us-ocean` | 1055–1060 |
| `.sat-on .country…` and `.sat-on .reveal-marker` | 1062–1099 |
| `.inset-frame` | 1101–1111 |
| `.no-borders …` (move the cursor rule 1113 to the host) | 1113–1129 |
| `.country.prompt-highlight` | 1670–1675 |
| `.country.learn-known`, `.learn-new`, `.learn-label text`, satellite and no-borders variants, `.learn-dot` | 1677–1727 |
| `.pin-mode` / `.pin-hard` rules on `#world-map` and `.country` (move the cursor to the host) | 1745–1754 |
| `.pin-guess`, `.pin-truth-ring`, `.pin-truth-dot`, `.pin-truth-label`, `.pin-line`, `.pin-layer`, satellite variants | 1763–1799 |
| `.us-ocean` | 1820–1823 |

Stays: `.map-wrap` (727–734), `.map-wrap.sat-on { background }` (1054), zoom controls (956–1007), `.zoom-hint`
and `hintFade` (1009–1032), `.sat-credit` (1131–1147), style button rules (1149–1151), review mode
(1153–1172), `.pin-prompt-country` (1755–1762), `.pin-scoring-note`, `.pin-weak`, `.pin-trend` (1800–1818),
toast (1248–1282).

### 5.3 Markup
- 2549 `<canvas id="sat-canvas">` and 2550 `<svg id="world-map">` → one `<div id="globe-host">` (G8).
- 2565: reword the hint.

---

## 6. Subtle behaviours that are easy to lose

### 6.1 Click precedence: tiny features vs. neighbours
Today, from the DOM order `backdrop → hit zones → all country polygons` (4920–4960, CSS 767–779):
1. A click **inside any polygon** goes to that polygon, eligible or not. Hit zones are underneath, so a big
   neighbour always wins at a shared border.
2. A click on an **ineligible** polygon does nothing: not a wrong guess, and it does **not** fall through to a
   tiny eligible neighbour's hit zone (5212).
3. A click on a polygon that is already **completed** (Normal) does nothing, and again does not fall through
   (5227–5230). The same guard applies when the click came through that feature's own hit zone.
4. A click on **open water** within 11 px of the outline of a tiny eligible feature (half the 22 px stroke)
   counts as a click on that feature, **including as a wrong guess** if it is not the target. Where two hit
   zones overlap, the feature later in the data wins.
5. "Tiny" is decided once, at 1×, when the map is built: bbox under 14 px; province rounds also area under
   200 px². The hit zone then stays active at every zoom level.
6. Anything else in open water does nothing.

Counts at 1280×565: World and Daily 58, Europe 10, North America 15, Oceania 0, India 8, Russia West 2, US 0.

Globe `onMapClick({ x, y, lonlat })`, in this order:
1. city-pin → pin handler. us-city → dot picking. us-state-to-capital → return.
2. `interactionLocked` or no `state.current` → return.
3. Exact hit on the active layer (`featureAt` with tolerance 0, no eligibility filter). Found and not
   eligible → return. Found and in `state.marks` (Normal) → return. Found → answer with it.
4. No exact hit → nearest **eligible** tiny feature within the tolerance → same completed check → answer.
   Use about 11–12 px for a mouse to match today; more for touch is fine.
5. For scattered territories (Andaman and Nicobar, Lakshadweep, Puducherry's enclaves, and island nations
   whose bounding box is large) the engine's "under ~14 px" test will not fire. Keep a per-round set of keys
   with small on-screen **area** at the home zoom (`featureInfo().areaSr × radiusPx²` under 200 px², the same
   threshold as today) and, when step 4 finds nothing, test the click against the projected vertices of just
   those features.
6. Because the context layer (`world` in US and province rounds) is not interactive, a click just outside
   Sikkim in Nepal still reaches Sikkim, as it does today over the blank backdrop.

Also carried by the engine now: a drag never ends in a click (today d3.zoom swallows it, comment at 4963);
double-click must not zoom (4861, G2); only the primary button drags (4862).

### 6.2 `interactionLocked`
- Set: after a correct answer (5150, 5244, 5400), after a reveal starts (5185, 5278, 5426, 5519), for the
  whole Learn study phase (6872).
- Cleared: `startGame` (4612) and `nextCountry` (5041) only. `nextCountry` returns before 5041 when the queue
  is empty, so the lock is **still on after the last answer**; that is what makes review mode inert.
- Not set: during the 700 ms wrong flash after a first miss (the player can click again at once); anywhere in
  Pin the City (it uses `state.pin.phase`).
- While locked: map clicks, dot clicks, capital buttons and Skip all return (5140, 5210, 5381, 5509).
  Zooming, rotating, the style button and Escape still work. An engine flight must not block input either.
- The Skip button is disabled only during a pin reveal (6486) and re-enabled by `nextCountry` (5103).

### 6.3 Hard mode keeps no marks
- `if (!state.hardMode)` guards every persistent mark: 5165, 5258, 5314, 5409, 5455.
- Because the "already answered" guard only looks at marks, in Hard and Uncharted an answered country can be
  clicked again and counts as a wrong guess. That is the mode ("no process of elimination"). Keep
  `state.marks` empty in hard mode rather than merely not painting it.
- View Map hidden: 5758–5761.

### 6.4 Uncharted
- Before an answer nothing shows a shape: no borders, no hover, crosshair cursor (1113–1117).
- A shape appears only as a flash (fill + 1.6 px light outline, 1118–1125) or a reveal (fill + 2.5 px gold
  outline + rings, 1126–1127), then vanishes (hard mode).
- States→Capitals in Uncharted: the prompted state is shown (fill + 1.6 px outline, 1128–1129).
- Learn study in Uncharted: tints and outlines stay visible (1718–1721); the quiz is borderless.
- Ineligible areas keep the dark `dim` fill.
- Menu switch is locked on (4422–4424, 7371); in-game button hidden (1151); `toggleMapStyle` and M do nothing
  (5896).

### 6.5 Satellite failure
- Detected when a finished draw found no imagery at all (6232). Then: `sat.failed = true`, `.sat-on` comes off
  so the whole look is parchment (Uncharted keeps `.no-borders`: a borderless parchment silhouette), credit
  hidden, and one toast of kind `wrong`: `Satellite imagery couldn’t load — showing the parchment map` (6236).
- The toast fires on the change to failed only, not on every redraw.
- It heals itself: satellite is still "enabled", every later zoom or pan redraws, and the first draw that finds
  a tile switches back (6233–6235). `failed` is also cleared at each game start (4715) and each style toggle
  (5899).
- The button keeps its active look while failed (5889 uses `on`, not `on && !failed`).
- Globe: map `onStatus('failed')` to exactly this; see G7 for retry and the Canvas2D case.

### 6.6 Esri credit
- `#sat-credit` (2566); text from `SAT_CREDIT` (5861) with a "Loading imagery… · " prefix while tiles are
  pending (5938–5940, set 5996, cleared 6223).
- Visible exactly when `.sat-on` is on (1147): every satellite and Uncharted game, **including review mode**
  (it is not in the hidden list at 1162–1168); hidden on parchment and while failed.
- If the globe ever shows imagery outside `.map-wrap` (a menu globe), the credit must go with it.

### 6.7 Zoom reset per game
- 4882–4885: every `renderMap()` ends at 1×, because the `<svg>` outlives the game and d3 remembers its zoom.
- Globe: frame + `setHome` at every `startGame` (replay, practice, daily replay, Learn start included). Not
  between questions, not between Learn levels, not on a style toggle, not on resize.

### 6.8 Marks after a resize
- 7681–7743; see 3.13 and B3. Phones rotate mid-round and in review mode (people rotate to take the
  screenshot), so this path is real.
- Globe: must come for free. Test it: answer some, rotate, check greens and reds, dots, pins, Learn tints.

### 6.9 Review mode keeps the marks
- See 3.12. Today it works by not touching the SVG after `finishGame()`.
- Hazard on a persistent globe: anything that repaints after the game ends (stale timers, B4; a shared menu
  globe) would wipe what View Map is meant to show.

### 6.10 Everything that reads the zoom factor `k` (or the transform)
| Lines | Reads | For | Globe |
|---|---|---|---|
| 4866–4867 | whole transform | Store; move the group | Dead |
| 4871–4874 | `k` | Dot radius `6 / k` | Dead (overlay px) |
| 4875, 7124–7129 | `k` | Label scale `1 / k`, debounce re-layout | Dead; `settle` |
| 4876, 5925–5929 | `k, x, y` | Satellite canvas follows the gesture | Dead |
| 4877, 6527–6532 | `k` | Pin marker scale | Dead |
| 4976, 4990 | `k` | Initial dot radius | Dead |
| 5324–5349 | `k, x, y` | Is the centroid in the middle 70 %? Re-centre if not, or if `k > 1.2` | `ensureVisible` |
| 5362–5367, 5495–5499 | `k` | Reveal marker scale | Dead |
| 5467–5484 | `k, x, y` | Same test for a point | `ensureVisible` |
| 6011, 6022, 6027–6028 | `k, x, y` | Canvas pixel → map units; round-trip tolerance | Dead |
| 6483–6484 | `k > 1.05` | Pan to the pinned city only when zoomed in | Always `ensureVisible` (4.3) |
| 6498–6499 | `k` | Pin marker scale at build time | Dead |
| 6896–6897 | `k > 1.05` | Bring the new province into view only when zoomed in | Always `ensureVisible` |
| 6928–6955 | `k, x, y` | Anchor → screen; `room = radius × k × 2` | `project()`, `radiusPx()` |
| 7708, 7739–7741 | whole transform | Restore after resize | Dead |

### 6.11 The map area changes size during a game (B2)
- The prompt panel grows after the map is set up: second line in Pin mode, the choices panel in
  States→Capitals, any name that wraps on a phone. The globe host follows, on any question.
- The engine's `k` is relative to `min(width, height)`; on a wide screen a shorter host means a smaller globe
  at the same `k`. Nothing breaks, but a frame fitted before the first prompt is slightly off.
- Do the first `fitTo` after the first prompt has rendered (today the order is `renderMap()` then
  `nextCountry()`, 4736–4738). On later host resizes, fit again only while the player has not moved the view.

### 6.12 Others
- **Stale timers** (B4): guard all twelve delayed callbacks with the game counter.
- **Clicking ineligible land or open water is free**, never a wrong guess (5212; no handler on the backdrop).
- **A wrong click names what was clicked** in the toast (5288–5289, 5429; Learn 5283–5284). Keep the picked
  feature's canonical name available.
- **First wrong flash and the reveal overlap**: on the second miss the clicked feature is red for 700 ms while
  the target is gold for 2600 ms.
- **Hover does nothing useful in States→Capitals and us-city** but is shown today. Recommended: no hover there,
  nor during Learn study.
- **Pin taps count only in the aim phase** (6437); S skips only in the aim phase (5513); Enter is Drop Pin / Next.
- **Daily**: all countries clickable though only five are asked (5023–5027).
- **Focus practice**: full map, short queue (3.11).
- **DC** is drawn but never a target (not in `US_STATE_SET`); the same for the world features with no
  continent (57 once B1 is fixed), and for the other two-thirds of Russia in a Russia round.
- **The toast, zoom buttons and credit live inside `.map-wrap`** and must stay above and outside the engine's
  host (G8).
- **Zoom hint** shows on the first game of a page load only (`state.zoomHintShown`, 4728–4732).
- **Graticule** is hidden on satellite (1059).
- **Palette swap mid-game** (M key) must keep marks, the prompt highlight, Learn tints, pins and dots, and swap
  the overlay colours that differ on satellite: rings (1099), miss line and truth ring (1798–1799).
- **Screens are hidden with opacity, not `display: none`** (112–125): the host keeps its size on the menu and
  results screens.

---

## 7. Acceptance checks for the port
1. World on parchment: Australia is land-coloured and gets asked; "Left" starts at 184. Oceania starts at 7.
2. Each of the six continents, the three US modes, Northeast cities, the six province rounds, the seven pin
   rounds and the Daily: the first frame is the one chosen in section 3, north up (World, Daily and Pin World
   start at the whole-globe home view). Look at a screenshot of each on a desktop and a phone shape.
3. Correct, first wrong, second wrong, skip: colours and durations match 2.1 and 2.3 in parchment, satellite
   and Uncharted. Hard and Uncharted leave no marks; clicking an answered country there is a wrong guess.
4. Tiny targets, with the place in view at the World home zoom: a click in open water 8 px from Barbados
   registers Barbados; a click inside Saudi Arabia right next to Bahrain registers Saudi Arabia; a click on
   Greenland does nothing.
   India: Lakshadweep, Puducherry and Andaman and Nicobar are tappable without zooming.
5. Drag, pinch and wheel never register an answer. A double-click registers two answers and no zoom jump.
6. Reveal: globe turns to a target on the far side; rings sit on the main landmass (France, USA, Norway).
7. States→Capitals: prompted state highlighted and in view on every prompt; map clicks do nothing.
8. us-city: dots stay 6 px at every zoom; the New York cluster picks the nearest dot; marks persist in Normal.
9. Pin: tap in space is ignored; pin, truth marker, label and dashed great-circle line match 4.3; both ends
   in view after the reveal.
10. Learn: India level 24 lays out like `learn-india-l24.png` (dotted names beside small states, the newest
    name largest and always shown); zooming in brings back hidden names; the pill appears only when a visible
    name was left off.
11. Rotate the device mid-round and in View Map: marks, dots, pins, tints and framing survive.
12. View Map after a Normal game shows every green and red; the map is inert; the Esri credit shows on satellite.
13. Tiles blocked (`tiles: 'fail'` in the harness): one toast, parchment look, Uncharted keeps no borders, no
    credit; next game retries.
14. Skip, Escape, start another level within 2 seconds: the new game's first question is not skipped and no
    country is pre-coloured.
15. `M` mid-game swaps the look and keeps every mark. `+`, `-`, `0` work; `0` returns to the round's frame.
