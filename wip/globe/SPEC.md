# Globe engine — specification

One self-contained browser script, `$S/work/globe/globe.js`, that defines a single global `Globe` (an
IIFE returning `{ create }`). It will later be pasted verbatim into `public/index.html` as a section of
the game's script, so: no ES modules, no imports, `'use strict'`, depends only on the globals `d3`
(d3-array + d3-geo only — NOT the full d3 bundle: no d3.select/zoom/transition) and `earcut`.
The engine knows nothing about the game (no "correct"/"missed" semantics, no DOM ids of the app).

## Rendering model
Orthographic globe, centre fixed at the middle of the host element, north always up (no roll).
View = `{ lon, lat, k }`: the lon/lat at screen centre and zoom `k` (k = 1 → the whole globe fits the
host with a margin; globe radius in CSS px `R = k * baseR`, `baseR = 0.46 * min(w, h)`).
`lat` clamps to ±85. `k` clamps to `[minZoom, maxZoom]` (defaults 1 and 80).

Canvases (created and owned by the engine, appended to the host, absolutely positioned, full size):
1. `canvas.globe-gl` — WebGL (WebGL1 with OES_standard_derivatives / ANGLE_instanced_arrays /
   OES_element_index_uint when present; WebGL2 is fine too if you prefer, but one code path must work
   on WebGL1). `antialias: true, alpha: true, premultipliedAlpha: true`. Backing store = CSS size ×
   `min(devicePixelRatio, 2)`.
2. `canvas.globe-overlay` — 2D, same size/DPR, on top, `pointer-events: none`.
Pointer events are handled on the host element.

Draw order each frame (only when something is dirty — no idle rAF spinning):
1. **Sphere pass** (one quad, fragment shader works per pixel): ocean colour with gentle limb shading,
   optional graticule (analytic lines every 20°, anti-aliased with derivatives), optional **imagery**
   (see below), and a soft atmosphere halo just outside the limb that fades to transparent. Outside the
   halo the canvas is transparent so the page background shows.
2. **Fill pass(es)** per layer: triangles on the unit sphere. Vertex shader rotates by the view matrix
   and scales; back-hemisphere geometry is clipped by the GPU (map view-space z so z < 0 falls outside
   clip space). Per-feature colour comes from a small RGBA "style texture" (one texel per feature),
   looked up in the fragment shader from a per-vertex feature index — changing a feature's look is one
   `texSubImage2D`, never a buffer rebuild. Fully transparent texels are discarded.
3. **Border pass** per layer: line segments as instanced screen-space quads (constant width in CSS px
   at any zoom, soft edges). Fallback to `gl.LINES` if instancing is unavailable.
4. **Overlay** (2D canvas): cleared, then every registered draw callback runs.

### Geometry build (per layer, once, when the layer is set)
- Input: GeoJSON features (Polygon / MultiPolygon; ignore others) + a key function.
- Rings: unwrap longitudes so each polygon is continuous (if a ring jumps > 180° between consecutive
  vertices, shift by ±360), then **densify** boundary edges so none exceeds ~1.5° of arc (interpolate
  along the great arc, matching how d3 interprets GeoJSON edges), then triangulate in the lon/lat plane
  with `earcut` (holes supported), then **conforming subdivision**: split every triangle edge longer
  than ~2° — decided per edge (same rule from both sides, canonical endpoint order for the midpoint) so
  neighbours stay crack-free — and put every vertex on the unit sphere. This keeps flat-triangle chords
  within a fraction of a pixel of the true limb at every zoom.
  Natural Earth data is pre-cut at the antimeridian and Antarctica has an artificial edge along
  lat −90: both triangulate correctly in the lon/lat plane. Verify this with the real data (Russia,
  Fiji, Antarctica, USA/Alaska, Chukotka in provinces-russia.json) rather than assuming.
- Borders: if the caller passes `borders` (a GeoJSON MultiLineString, e.g. from `topojson.mesh`) use
  it; otherwise use the polygon rings. Densify the same way.
- Building 100k points must not freeze the page: target < 150 ms on a laptop for countries-50m; if it
  is slower, build in slices across frames (the layer appears when ready) and report progress.
- Per feature, precompute and keep on the CPU: bounds (`d3.geoBounds`), centroid (`d3.geoCentroid`),
  angular radius of a bounding cap, and area (`d3.geoArea`) — used for picking and culling.

### Imagery (satellite)
`setImagery({ enabled, tileUrl(z, x, y), maxZoom = 15, onStatus })`. Tiles are 256 px Web Mercator
(`crossOrigin = 'anonymous'`). The sphere shader converts each pixel to lon/lat → Mercator and samples:
- a **base** texture: the whole world mosaic at tile zoom 2 (16 tiles → 1024²), loaded first and kept;
- a **detail window** texture: a Mercator-aligned mosaic of the tiles covering the current view at the
  tile zoom that matches screen pixels (cap the mosaic at 2048 px on a side and ~40 tiles; drop a zoom
  level when over), rebuilt ~150 ms after the view settles and again as its tiles arrive. The shader
  uses the window where it covers the pixel and the base elsewhere, so rotating shows soft imagery
  immediately and sharpens when the gesture ends. Handle the window crossing the antimeridian.
- Latitudes past ±85.0511 clamp to the edge row. Keep an LRU of decoded tile images (≈160).
- `onStatus('loading' | 'ready' | 'failed')`: `failed` only when no tile at all could be loaded
  (offline) — the engine then stops drawing imagery (ocean colour shows) until re-enabled/retried.
- Precision: do the view-dependent maths in the shader with `highp` where available.

### Canvas2D fallback
If WebGL can't be created (or `opts.forceCanvas2D`), draw the same scene on a 2D canvas with
`d3.geoOrthographic().clipAngle(90).precision(0)` + `d3.geoPath(projection, ctx)`: sphere, fills by
style, borders. While the view is moving, draw only features whose bounding cap intersects the visible
hemisphere and skip features smaller than ~1.5 px; redraw fully on settle. No imagery in this mode
(`onStatus('failed')` if enabled). Picking/overlay/interaction code is shared with the WebGL path.
Handle `webglcontextlost`/`restored` (rebuild GPU resources from the retained CPU-side data).

## API

```js
const globe = Globe.create(hostEl, {
  minZoom: 1, maxZoom: 80,
  theme: { ocean: '#a7c0c9', oceanEdge: '#7a9ba6', graticule: 'rgba(31,42,58,0.10)',
           atmosphere: 'rgba(167,192,201,0.55)', limb: 'rgba(31,42,58,0.35)' },
  forceCanvas2D: false
});

// --- Layers (drawn in the order given; later layers on top) ---
globe.setLayers([
  { id: 'context', features, key: f => String(f.id), interactive: false,
    borders: optionalMultiLineString, borderColor: 'rgba(...)', borderWidth: 0.6, style: 'dim' },
  { id: 'active', features, key, interactive: true, borderColor, borderWidth: 0.9, style: 'land' }
]);                                   // returns a Promise that resolves when GPU buffers are ready
globe.updateLayer(id, { features?, borders?, borderColor?, borderWidth?, bordersVisible?, visible?, style? });
                                      // swapping `features` keeps per-key styles already set

// --- Styles: a named palette; any CSS colour string incl. rgba()/transparent ---
globe.defineStyles({ land: '#f5ebd4', dim: 'rgba(...)', good: '...', bad: '...', hidden: 'transparent' });
                                      // redefining repaints every feature using that name
globe.setStyle(layerId, key, styleName);            // one feature
globe.setStyles(layerId, { key: styleName, ... });   // many
globe.resetStyles(layerId, styleName?);             // all features back to the layer default (or styleName)
globe.flash(layerId, key, styleName, ms = 700);      // show styleName, then fade back to its set style
globe.setHoverStyle(layerId, styleName | null, key => boolean /* which keys may hover */);

// --- View ---
globe.getView();                                    // { lon, lat, k }
globe.setView({ lon, lat, k });                     // immediate
globe.flyTo({ lon, lat, k }, { duration = 700 });   // eased; returns a Promise; interrupted by user input
globe.fitTo(geojson | [features], { padding = 24, maxZoom, animate = false, duration });
                                      // centre on the spherical centroid; zoom so the object's
                                      // projected extent fits the host inside padding (CSS px)
globe.setHome(view);  globe.resetView({ animate = true });   // fitTo() also sets home
globe.zoomBy(factor, { animate = true });           // about the screen centre
globe.ensureVisible(lonlat | feature, { margin = 60, animate = true });
                                      // fly only if it is on the far side, off-screen, or within
                                      // `margin` px of the host edge; if it is a tiny feature
                                      // (under ~10 px across) also zoom in until it is ~24 px
globe.spin(degPerSecond);                           // idle auto-rotation (0 stops); pauses while the user interacts

// --- Geometry helpers ---
globe.project([lon, lat]);          // { x, y, visible } in CSS px relative to the host; visible=false on the far side
globe.invert(x, y);                 // [lon, lat] or null when off the globe
globe.featureAt(x, y, { tolerance = 22, eligible: (layerId, key) => boolean });
   // → { layerId, key, feature } or null. Topmost interactive layer first: exact spherical
   // point-in-polygon (`d3.geoContains` after a bounds pre-filter). If nothing is hit, the nearest
   // *eligible* feature whose on-screen size is under ~14 px and whose nearest vertex/centroid is
   // within `tolerance` px — so tiny islands are tappable.
globe.featureInfo(layerId, key);    // { feature, centroid, bounds, radiusDeg, areaSr }
globe.radiusPx();                   // current globe radius in CSS px

// --- Events (set by assignment or via on(name, fn)) ---
globe.on('click', ({ x, y, lonlat, hit, originalEvent }) => {});   // a tap/click that was not a drag (< 6 px, < 400 ms move)
globe.on('hover', hit => {});          // mouse only; null when leaving
globe.on('view', (view, { moving }) => {});   // every frame the view changes
globe.on('settle', view => {});        // ~150 ms after the last view change
globe.on('ready', () => {});           // first frame drawn with all layers

// --- Overlay ---
const off = globe.addOverlay((ctx, g) => { /* g.project, g.view, g.width, g.height, g.dpr, g.time, g.radiusPx */ });
globe.invalidate();                    // request one redraw (GL + overlay)
globe.animate(ms);                     // keep redrawing every frame for the next ms (for overlay animations)
// Overlay helpers (plain functions on `globe.draw`, usable inside overlay callbacks):
globe.draw.geoLine(ctx, lonlatA, lonlatB, opts);       // great-circle arc, clipped at the limb
globe.draw.outline(ctx, feature, { stroke, width, fill });   // one feature's outline via d3.geoPath (cheap for a few)
globe.draw.rings(ctx, lonlat, { t, color, count });    // pulsing reveal rings; t in [0,1]

// --- Imagery, theme, lifecycle ---
globe.setImagery({ enabled, tileUrl, maxZoom, onStatus });
globe.setTheme(partialTheme);  globe.setGraticule(boolean);
globe.attachTo(hostEl);                 // move the canvases to another host (same GL context) and resize
globe.resize();                         // also wired to a ResizeObserver on the host
globe.pause(); globe.resume();          // stop/restart drawing and input (hidden screens)
globe.stats();                          // { renderer: 'webgl'|'canvas2d', frames, lastFrameMs, avgFrameMs, triangles, segments, buildMs }
globe.destroy();
```

## Interaction
- **Drag** (mouse, touch, pen via Pointer Events; `touch-action: none` on the host): rotates so the
  ground follows the pointer — `dLon = dx / (R·max(cos lat, 0.3))`, `dLat = dy / R` (radians), no roll.
  Release with velocity → inertia with exponential decay (≈ 350 ms time constant), cancelled by any
  new input. Dragging off-globe space also rotates.
- **Wheel / trackpad**: zoom toward the cursor (the lon/lat under the cursor stays under it). Smooth:
  accumulate wheel delta into a target zoom and ease toward it; handle `ctrlKey` pinch-wheel.
- **Pinch**: two pointers scale `k` about their midpoint and rotate the globe with the midpoint's motion.
- **Double-click / double-tap**: zoom in ×2 toward that point.
- **Keyboard** is the game's job (it calls `zoomBy`, `resetView`), not the engine's.
- A click is reported only if the pointer moved < 6 px. Never report a click at the end of a drag/pinch.
- Cursor: `grab` / `grabbing`; the game may override with CSS.
- Respect `prefers-reduced-motion`: `flyTo`/`fitTo` animations become instant; inertia off.

## Quality bar
- Rotating/zooming the 50m world: JS time per frame < 2 ms (no per-frame allocation in the hot path,
  no per-frame geometry work), draw calls ≤ ~10. No frames drawn when idle.
- Crisp at any zoom: fills meet the limb with no visible gap; no cracks between triangles; borders
  constant width; no z-fighting between layers (draw order, depth test off).
- Semi-transparent fills (alpha 0.2–0.7) must not show triangle seams or double-blending inside a layer.
- Looks good: this is the centrepiece of the app. Subtle limb shading, soft halo, clean borders.
- Correct: `project`/`invert` are exact inverses; `featureAt` agrees with `d3.geoContains`; the WebGL
  picture matches a d3.geoOrthographic reference render of the same view (land mask IoU ≥ 0.985).

## Deliverables (all under `$S/work/globe/`)
- `globe.js` — the engine.
- `demo.html` — a page (served by the harness with `root: '$S/work/globe/site'` or similar — you decide
  the layout; put a `site/` folder with `index.html`, the vendor scripts copied from
  `$S/vendor/node_modules` and data files copied from world-atlas / the repo's `public/data/`) that
  shows the 50m world, lets a person drag/zoom, toggles imagery, switches to US states and a province
  file, and exposes `window.globe` for tests.
- `test-globe.js` — an automated Playwright script using the harness that checks, and prints PASS/FAIL
  per check: build time; project/invert round trip; `featureAt` vs known points (Paris→France,
  Nairobi→Kenya, mid-Pacific→null, a tiny island via tolerance); style changes show up in pixels;
  WebGL vs d3 reference land-mask IoU at ≥ 4 views (incl. one centred on the antimeridian, one polar,
  one zoomed ×20 on Europe, one with the limb crossing Russia); imagery alignment with the mock tiles
  (sample pixels at known land/sea lon/lats at ≥ 3 views, with fills transparent); drag, wheel-zoom
  toward cursor, pinch (via CDP touch events), click-vs-drag discrimination; `ensureVisible`; the
  Canvas2D fallback (`forceCanvas2D`) passing the same picking/style checks; idle = no frames;
  per-frame JS time during a scripted 120-frame rotation.
- Screenshots under `$S/shots/globe/` that you have looked at.

---

## Addendum — requirements found while auditing the game (part of the spec)

These came out of an audit of how the game uses its map (`$S/maps/map-port-checklist.md`, sections 0.3 and
6.1). They are required for release. Whoever is working on `globe.js` when one is missing implements it:
the imagery engineer does A5; reviewers report any that are missing or wrong; the hardening engineer
implements whatever is still missing. Each needs a check in `test-globe.js`.

- **A1 Options after creation.** `globe.setOptions({ dblClickZoom, minZoom, maxZoom })`. `dblClickZoom`
  (default `true`) turns double-click/double-tap zoom off — the game turns it off during play, where two
  quick answer taps must not move the view. `create()` accepts the same keys.
- **A2 Deep zoom.** `maxZoom` may be set as high as 600 (the game sets `max(80, 60 × fitK)` per round so
  tiny places stay reachable). Everything — fills, borders, picking, overlay, imagery — must stay correct
  and jitter-free at k = 600. Test at k = 300 and 600 on Macau, Luxembourg and Rhode Island.
- **A3 Picking rules.** `featureAt(x, y, { tolerance, eligible })`:
  (a) an exact polygon hit on an interactive layer is always returned, whether or not it is `eligible`
  (the caller decides what to do with a non-eligible hit); `eligible` filters only the fallback;
  (b) fallback candidates are eligible features that are *small on screen*: bounding-cap diameter under
  ~14 px **or** on-screen area (`areaSr × R²`) under ~200 px² — the second rule catches scattered
  territories such as Lakshadweep or Puducherry whose bounding cap is large but whose land is a few pixels;
  (c) distance for the fallback is from the pointer to the feature's nearest vertex on screen (front
  hemisphere only), and the nearest candidate within `tolerance` wins. The result says which rule matched:
  `{ layerId, key, feature, exact: boolean }`.
- **A4 `fitTo` input.** Accepts any GeoJSON object — Feature, FeatureCollection, or a bare geometry
  including `MultiPoint` and `LineString` — or an array of features. (The game frames continents with a
  `MultiPoint` of box corners; never assume polygons.)
- **A5 Imagery retry.** After `failed`, the engine retries by itself when a later view settles (at most
  once every ~10 s) and reports `ready` if tiles then load; calling `setImagery({ enabled: true })` again
  retries at once. `globe.supportsImagery()` → `false` in the Canvas2D fallback (so the game can lock its
  satellite switch instead of reporting a failure every game).
- **A6 No needless rebuilds.** `setLayers` must not rebuild geometry for a layer whose `id` and
  `features` array (same reference) are unchanged; `updateLayer(id, { visible, style, … })` never rebuilds.
  Keys must be unique within a layer; on a duplicate key, `console.warn` once naming it.
- **A7 What counts as a click.** The pointer travelled < 6 px between down and up. Duration does not
  matter (children press and hold). Only the primary mouse button drags or clicks.
- **A8 Pointer position events.** `globe.on('hover', (hit, { x, y }) => …)`, and
  `globe.on('move', ({ x, y, lonlat }) => …)` for mouse movement that is not a drag (so the game can do
  its own hover for dots drawn on the overlay).
- **A9 Anchor point.** `globe.anchor(layerId, key)` → `[lon, lat]`: the most-inside point (pole of
  inaccessibility, holes respected) of the feature's largest polygon, computed lazily in a local
  azimuthal projection centred on that polygon and cached. Labels, reveal rings and `ensureVisible` use
  it, because the centroid of a multi-part country is often outside it (France's is in Spain).
  `ensureVisible(feature)` should aim at the anchor when the feature's bounding cap is large.
- **A10 Outlines on the overlay.** `globe.draw.outline(ctx, feature, opts)` clips at the limb correctly
  (a feature partly behind the globe draws only its visible part) and is cheap enough for a handful of
  features per frame while animating.
