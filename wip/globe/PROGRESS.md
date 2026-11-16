# Globe engine core — progress log

(Kept current by whoever is working on `globe.js`. Trust nothing here without re-running the tests:
`NODE_PATH=/opt/node-tools/node_modules node test-globe.js [group-filter]`, full run ≈ 3.5 min.)

Scope of this job: everything in SPEC.md + Addendum EXCEPT satellite imagery (setImagery stays a no-op
that reports `failed`; A5 belongs to the imagery engineer).

## Baseline when the second engineer took over (2026-11-16)
Full run of the inherited files: **217 passed, 3 failed, 220 checks** (Macau deep zoom ×2, anchor).

## State now
Last full run (before the new checks below existed): **221 passed, 0 failed**. Every group touched since
has been re-run on its own and passes; a full run is still owed (step 4 below).

### Code changes made (all in globe.js), each with its check in test-globe.js
- **Hole at the centre of the view at deep zoom (fixed).** Fill and line vertex shaders mapped view z
  to clip z as `1 - 2z`; a vertex at the exact view centre could round past the near plane and cut a
  notch out of small shapes (Macau lost 8 %). Now `1 - z`. Check: deepzoom "nothing is cut out of the
  picture where a vertex sits at the centre of the view" (verified to FAIL on the old shader).
  The Macau check's "covers > 5 %" condition was replaced by a pixel count (Macau is 1 % at k = 300).
- **Anchor (A9):** `ANCHOR_PRECISION` = 1/400 of the polygon's smaller dimension (was 1/100);
  `insidePoint()` also returns the exact clear radius; new API `anchorRadiusDeg(layerId, key)` (the
  game's label layout needs it — checklist 4.4). Checks: anchor group (clearance guarantee on the holed
  disc, radius vs. construction, radius sane on every real feature).
- **Layers / A6:** `interactive` is a plain flag (picking rings are always kept), settable through
  `updateLayer(id, { interactive })` and `setLayers` without a rebuild. Same features array + different
  `borders` object keeps the triangles (`makeLayer(def, like)` shares `meta` and the fill arrays).
  `buildFeature(feature, index, wantMesh)` returns the meta and caches it per feature object in the
  module-level WeakMap `featureMeta`; `measureFeature()` reads that and never calls a layer's key
  function on foreign features. Checks: rebuilds group, fit-input "objects outside every layer...",
  layer-order group.
- **Winding:** `loadPolygon` records each ring's winding; `ringsForD3()` gives `part.geom` in d3's
  winding, so the Canvas2D renderer, `draw.outline` and `featureInfo().bounds` do not depend on the
  input's winding. `draw.outline` skips features wholly behind the limb. Checks: canvas2d "polygons
  wound the other way...", robustness "...and so are their bounds and their overlay outline".
- **Robustness:** shader compile/link failure at creation → console.warn + Canvas2D on a fresh canvas.
  A context lost for `CONTEXT_WAIT_MS` (4 s) of visible page time → `fallBackToCanvas()` (new canvas,
  2D renderer, border lines re-prepared, `renderer` event). Checks: robustness group (shader failure,
  lost while building, lost for good).
- `supportsImagery()` → false (stub for A5). SPHERE_FS has a `surfaceColor(geo, r2)` function: the
  slot for the imagery lookup. Hover is re-evaluated after `updateLayer` / a layer swap.
- **Hot path:** uniforms are passed to WebGL as typed arrays (`set1` / `set2` / `setColor`): a
  fractional number handed straight to `gl.uniform*f` is boxed by the JS engine on every call. Measured
  with the sampling heap profiler over 300 rotation frames after warm-up: garbage attributed to
  globe.js went from ~920 B/frame to ~340 B/frame, none of it objects (what is left is number boxing
  at the Canvas API boundary in the overlay). The 'move' event reuses its lon/lat pair.
- **Picking:** the early-out bound for "nothing in this bounding cap can be within the tolerance" used
  R·sin(radius); the correct reach of a cap on screen is the chord, 2R·sin(radius/2) (`capDistance`).
  Also applied per feature before looking at its polygons. `featureAt` costs 2–6 µs on the real sets.
- New checks for things the spec states but nothing tested: random-view d3 sweep (reference),
  Canvas2D on US states + Russian provinces moving and settled (canvas2d), 600 features in a layer
  (styles), fills reach the limb and border width is constant from k = 1 to 600 (crisp), layer order
  and picking precedence (layer-order).

- Screenshots regenerated and LOOKED at (demo-desktop-world, view-europe, demo-desktop-us,
  demo-desktop-russia, canvas2d-world110, plus a WebGL-vs-Canvas2D side by side): all fine.
- Real data: ring winding of all 8 data sets already matches d3's (0 rings rewound at build).

- Full run #3 (after the picking / uniform edits): **244 passed, 0 failed, 244 checks**.
- After that run: readability pass (view-space helpers `viewX/viewY/viewZ`, guard for
  `MediaQueryList.addEventListener` on older Safari, a comment in `ensureVisible`); the groups that
  exercise them were re-run and pass. Probe scripts, logs and probe screenshots are deleted.

## Remaining, in order
1. Final full run, exact counts → write them here.
2. Final report (deviations and known issues below).

## Known issues / limits (for the report)
- Canvas2D fallback speed, measured here: 50m world ≈ 49 ms per moving frame (68 ms settled), US
  states ≈ 41 ms, Russian provinces ≈ 28 ms, 110m world ≈ 7 ms. It meets the spec's culling rule but
  is no faster than d3 allows.
- Border geometry costs 112 bytes per segment on the CPU and again on the GPU (50m world: 78,396
  segments ≈ 8.8 MB each side). Instancing would cut it to a quarter; not done.
- Anchors cost up to ~10 ms for the biggest polygons (Alaska at 10 m detail), once per feature.
- After warm-up a rotation frame still leaves ~0.3 KB of boxed numbers behind (Canvas API calls in
  the overlay); no objects are allocated per frame.
- Devices without highp fragment precision would get a slightly rough limb edge (not testable here).

## Known deviations from SPEC (deliberate)
- Triangulation is done per polygon in a gnomonic tangent plane (great-circle edges are straight
  there), not in the lon/lat plane; no longitude unwrapping, antimeridian/poles need no special case.
  Subdivision rule (2° edges, per-edge midpoints) as specified.
- Borders are non-instanced quads with miter joins (4 vertices per segment, indexed), so neither
  ANGLE_instanced_arrays nor a gl.LINES fallback is needed. OES_element_index_uint is optional
  (falls back to un-indexed arrays). Graticule AA uses analytic derivatives (no
  OES_standard_derivatives).
- Translucent fills use the stencil buffer so a layer never blends a pixel twice.
- Canvas2D settled frames use d3 precision 0.5 (adaptive resampling), moving frames precision 0.
- API additions beyond the spec: `anchorRadiusDeg`, `updateLayer({ interactive })`, events `progress`
  and `renderer`, `project()` also returns `z`, CSS custom properties for the cursor.
- Not done here by design: imagery (A5), `supportsImagery()` is a stub returning false.

## Notes for a successor
- `_probe/` holds throwaway scripts (lib.js loads the page helpers out of test-globe.js). Delete it
  when done; nothing in the tests uses it.
- The imagery engineer's hook: `surfaceColor()` in SPHERE_FS; `setImagery` / `supportsImagery` stubs
  sit together near the end of `create()`.

## Core stage closed (orchestrator, 2026-11-16 11:20 UTC)
Final full run of test-globe.js on the files as left above: **244 passed, 0 failed, 244 checks**.
The core stage is finished. What follows belongs to the imagery stage (A5) and later stages; each adds
its own section below and leaves the sections above as the record of the core.

---

# Imagery stage (A5 + spec section "Imagery") — CLOSED 2026-11-16

Final full run of test-globe.js: **287 passed, 0 failed, 287 checks** (4 min 8 s; log in
`.imagery-final-run.log`). 244 of them are the core's; 43 are new, in the groups `imagery-align` (18),
`imagery-moving` (8), `imagery-hidpi` (2), `imagery-retry` (5, waits 10 s), `imagery-offline` (4, harness
`tiles: 'fail'`), `imagery-housekeeping` (6). The old stub checks in `lifecycle` and `demo` were rewritten.
Nothing under /home/user/atlas-game was touched.

## What was built (all in globe.js; search for "Imagery" / "mosaic")
- **Mosaics.** Tiles are copied into RGBA textures with power-of-two sizes, mipmaps and (where the GPU has
  it) 4× anisotropic filtering; unwritten texels are transparent. `base` = the whole world at tile zoom 2
  (16 tiles, 1024², REPEAT in x), loaded first and kept. Two detail windows, `top` (current) and `under`
  (the one before it, kept underneath until `top` is complete, then released).
- **Shader** (`IMAGERY_GLSL`, used by `SPHERE_FS`): each pixel's Web Mercator position is worked out
  *relative to the view centre* from small view-space offsets (short series for atan / atanh at small
  angles), so it is exact at k = 600; JS passes the view centre's texture coordinate in each mosaic every
  frame in double precision (`placeImagery`). Layers base → under → top are composited with premultiplied
  "over": a tile that has not arrived lets the coarser picture show. Two measures of longitude (second
  lookup only while `uFar`) so mipmaps have no seam on the meridian opposite the view centre. Past
  85.0511° the last row of the map carries on.
- **Window choice** (`wantedWindow`, run on settle / resize / enable): the tile zoom whose texels match a
  device pixel at the visible latitude nearest the equator, capped at `maxZoom`, 8×8 tiles and 40 tiles
  (except at tile zoom 3, where the mosaic is the whole world, 64 tiles). A window that still holds the
  tiles wanted is extended in place instead of being rebuilt.
- **Tile cache**: 160 decoded images, least recently used dropped first, tiles in a mosaic pinned; loads
  nobody is waiting for are abandoned.
- **Status** (`onStatus`): 'loading' whenever tiles are on their way, 'ready' when none are and something
  is drawn, 'failed' when nothing at all could be loaded (imagery then stops being drawn). A5: after
  'failed' the engine asks again by itself when a view settles 10 s or more later (quietly: only 'ready'
  is reported, if tiles come); `setImagery({ enabled: true })` asks again at once. `supportsImagery()`
  is false with Canvas 2D (and `setImagery` there answers 'failed').
- Context loss: mosaics are rebuilt from the cache. Falling back to Canvas 2D drops imagery ('failed').
- `stats().imagery` = `{ status, zoom, loading, tiles }` while imagery is on, else null.
- Demo (`site/index.html`): the Imagery button turns it on, clears the fills, lightens the borders, shows
  a credit line and the status in the readout; says "unavailable" and puts the drawn map back on failure.

## Checked by breaking the engine on purpose (each made its check fail, then was undone)
imagery one texel out of place → 9 alignment checks fail; no second longitude measure → the pole/seam
check fails; retry delay 100 ms → A5 check fails; previous window not kept underneath → "no step back"
check fails. (A float32-rounded view centre is NOT caught at k = 600: the error is 0.06 texel.)

## Screenshots looked at (`$S/shots/globe/`)
imagery-world, -antimeridian, -arctic, -x20, -x60, -fiji (tinted fill + yellow borders on the tiles'
coast), imagery-soft / imagery-sharp (tile labels show zoom 3 → 7), imagery-deep (k = 600, zoom 12),
imagery-south-pole, demo-desktop-imagery.

## Deviations from SPEC (deliberate)
- Two detail windows instead of one (so the picture never steps back while tiles load); mosaics are
  power-of-two textures with mipmaps rather than exact-size ones.
- The ~40-tile cap does not apply at tile zoom 3 (whole world, 64 tiles): otherwise the opening k ≈ 1 view
  would have base-only imagery, 2–4× blurred.
- 'loading' is reported again whenever detail tiles are being fetched (the game's "Loading imagery…"
  prefix wants that), not only for the first load.
- setImagery's options are sticky: later calls may pass only what changes.

## Known limits
- Never run against real Esri tiles (unreachable here): JPEG decode cost, real network timing and the look
  of real imagery are untested. The stand-in tiles are SVG.
- A desktop-size host at 2× usually gets imagery at CSS-pixel resolution, not device-pixel: the 2048 px /
  40-tile caps drop one zoom level (800×600 at 2× would need 42 tiles). Phones fit.
- With a pole in sight the window must span every longitude, so detail stops at tile zoom 3.
- Within a few px of a pole the colour is a coarser average of the map's last rows, not the last row.
- GPU memory: base 5.6 MB; a 2048² window is 22 MB with mipmaps, and two exist while a new one loads.
- Rebuilding a window from cached tiles copies up to 64 tiles in one go at settle (not timed on a real GPU).
- A stale window that ends up more than 90° of longitude west of the view centre beyond a pole is not
  drawn there (the base shows instead).

## Notes for a successor
- The browser hands back images it has just shown without a network request, so tests must not count
  requests to tell whether tiles were loaded again: watch the status, or use another URL
  (`T.TILE(z, x, y) + '?again'`).
- The stand-in tiles have a line on every tile boundary (the equator included) and a label in each tile's
  top-left corner: sample "plain" colours away from those ([-32, 12] is open Atlantic).
- The far-meridian seam only shows when the middle of the host falls inside a 2×2 pixel block (host width
  802, not 800): the pole check resizes the host for that reason.
- Tests that make tiles fail must call `forgiveTileErrors(h)`: the browser logs each failed image.

---

# Review B (visual quality + performance) — IN PROGRESS

Reviewer only: globe.js and test-globe.js are NOT edited by this stage. Probe scripts live in
`review-b/`, screenshots in `$S/shots/globe/review-b/`. Run a probe with
`cd review-b && NODE_PATH=/opt/node-tools/node_modules node <script>.js` (python ones: `python3 <script>.py`).

## Done (scripts exist, were run, output looked at)
- `review-b/lib.js` (open/settle/setView/shot helpers), `review-b/crop.py` (crop + enlarge + side by side).
- `review-b/shots.js [d1|dark|d2|phone]` → 53 screenshots (`d1-*`, `dark-*`, `d2-*`, `phone-*`); log `shots.log`.
  All looked at (whole or as `sheet-*.png` contact sheets, details as `crop-*.png`).
- `review-b/seams.js` + `seams.py` (flat scene: land red, ocean blue, borders off; opaque and 50 %):
  results in `seams-d1-result.txt`, `seams-interior-result.txt`. RESULT: no cracks, no double blending
  (0 off-colour px in 3.8 M interior land px, 12 views incl. US/China/Russia sets; the "crack px" the
  first script lists are real sub-pixel inlets, checked in `crop-cracks.png`).
- `review-b/limb.js` + `limb.py` (does land reach the disc edge; truth = featureAt): `limb-d1-result.txt`.

## Remaining
- Extra shots: Caribbean x40 re-centred (first try was open sea), borders-hidden real theme.
- `review-b/perf.js` (240-frame rotation, zoom sweep, allocations, draw calls, memory, build times).
- Final findings report (StructuredOutput).

## Findings so far (evidence = files in `$S/shots/globe/review-b/`)
1. MAJOR — detailed coastlines turn into dark, heavy blots at low zoom (alpha of overlapping border
   quads accumulates): `crop-us-china-coast.png`, `crop-phone-us.png`, `crop-limb-d1.png` (middle),
   `crop-img-pole-limb.png` (white clumps with imagery). Straight borders stay thin and light.
2. MINOR/MAJOR — imagery on DPR 2 desktop is soft (tile zoom 5 where ~6.5 matches device px at Europe x8):
   `crop-d2.png` right panel. PROGRESS "Known limits" already admits it.
3. MINOR — with imagery the cap beyond 85.05° is a flat disc with pie wedges (last tile row smeared);
   at k = 1 near the limb it is blocky: `crop-img-pole-limb.png` left, `sheet-img-a.png`. Mock tiles
   exaggerate it (their last row is a border line).
4. MINOR — the outermost limb pixel over land is ~27 % ocean colour (limb coverage applied in both the
   sphere pass and the fill pass on top of MSAA clipping): `limb-d1-result.txt`. Hidden by the rim tint
   in the default theme.
5. NOTE — 50m islands are 5-8 vertex polygons at x40 (data, not engine): `d1-carib40.png`.
6. NOTE — canvas is capped at DPR 2, so DPR 3 phones upscale 1.5x (by spec): `crop-phone-us.png`.
- Clean: translucent fills (0.3 / 0.65 / 0.5) with and without imagery, antimeridian, Antarctica/pole
  fill, halo (no banding on dark or parchment), borders on the far side (none), DPR 2 vectors (crisp).

---

# Review A (correctness / robustness) — IN PROGRESS
Running log, probes and confirmed defects: `review-a/PROGRESS-A.md` (kept there because two reviewers write
PROGRESS.md at the same time; review B: please keep this section when you rewrite the file).
