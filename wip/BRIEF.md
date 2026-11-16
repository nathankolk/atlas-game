# Atlas overhaul — shared brief (working context for agents; not a repo doc)

Repo: `/home/user/atlas-game` (branch `claude/determined-hamilton-w2lcbm`). The app is ONE file,
`public/index.html` (~8,200 lines: CSS, markup, one IIFE script). CLAUDE.md and `atlas_handoff.md`
describe it. It stays one HTML file, no build step, no framework.

Scratchpad root (call it `$S`): `/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad`

## What the owner asked for
1. Faster, smoother map — both the regular map and satellite mode.
2. The map is a **globe**, not flat.
3. A facelift: looks better, more detail/organisation/stats, feels professional, sleek, modern.
4. A really strong geography *learning* app that teaches in a variety of ways. Anyone can use it.

## Decisions already made (do not relitigate)
- **Globe only.** Every map mode renders on one orthographic globe (drag to rotate, north always up,
  wheel/pinch zoom). The flat projections (Natural Earth, Mercator, Albers USA insets, conics) go away.
- **GPU rendering.** d3 + Canvas2D costs ~225 ms/frame for the 50m world on a slow CPU; SVG is worse.
  The globe is a small WebGL engine (pre-triangulated fills, instanced border lines, sphere shader that
  also reprojects satellite tiles per pixel), with a d3 Canvas2D fallback when WebGL is unavailable.
  Labels, pins, dots, rings draw on a 2D overlay canvas positioned by the engine's `project()`.
- **Libraries are self-hosted** in `public/vendor/` (d3-array + d3-geo + topojson-client + earcut, not the
  full 280 KB d3 bundle) and world data in `public/data/` (countries-110m for first paint, 50m after).
  No third-party origin is needed to play except Esri imagery tiles and Google Fonts.
- **Brand evolves, it isn't replaced.** Keep the cartographic identity: parchment/ink/gold/sepia/moss
  palette and Cormorant Garamond for display type. Modernise everything else: layout, spacing, components,
  a clean sans for UI text, a dark "night chart" theme alongside the light parchment one.
- Standing owner rules that still apply: no hint buttons, no hover tooltips, no public leaderboards, no
  live multiplayer, don't regenerate favicons/OG image, localStorage is the source of truth (sync mirrors
  it), the game must work offline once loaded, don't rebuild from scratch — extend.

## Test harness (use it; the sandbox blocks the CDNs and the Esri tile host)
`$S/harness/atlas-harness.js` — `const { launch } = require('$S/harness/atlas-harness.js')`
- `launch({ width, height, mobile, dpr, root, tiles: 'mock'|'fail', seedStorage })` →
  `{ page, url, errors, netLog, close }`. Serves `root` (default: the repo's `public/`), answers
  cdnjs/jsdelivr/unpkg requests from `$S/vendor/node_modules`, and answers Esri tile requests with
  generated stand-in tiles (Natural Earth land in green on blue sea, drawn in Web Mercator, with the tile
  key printed on each) so imagery/border alignment can be checked by eye and by sampling pixels.
- Run scripts with `NODE_PATH=/opt/node-tools/node_modules node script.js`. Chromium + Playwright are
  pre-installed; do NOT run `playwright install`. WebGL works headless (SwiftShader, software) — fine
  for correctness, not representative for GPU speed. Measure JS time per frame instead.
- Screenshots: save under `$S/shots/<your-area>/` and LOOK at them with the Read tool. A visual feature
  is not done until you have looked at a screenshot of it.
- npm packages available in `$S/vendor/node_modules`: d3, d3-geo, d3-array, topojson, topojson-client,
  earcut, world-atlas (countries-50m/110m, land-*), us-atlas. npm registry is reachable if you need more.
- Real Esri imagery and the live site cannot be reached from here. Never claim they were tested.

## Code style (from CLAUDE.md)
`'use strict'`, semicolons, 2-space indent, `//` comments, `/* ===== Section ===== */` dividers, a one-line
comment above non-obvious functions, CSS custom properties for colour (never hardcode a colour that has a
token). Comments say what the code does or why — never narrate the change history.
