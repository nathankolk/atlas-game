export const meta = {
  name: 'atlas-code-inventories',
  description: 'Exhaustive inventories of the current app: map touchpoints to port, and the UI surface to redesign',
  phases: [{ title: 'Inventory', detail: 'two readers write checklists for the integration stages' }],
}

const S = '/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad'
const BASE = `Read ${S}/BRIEF.md first (in it $S means ${S}). You are preparing a checklist another engineer will ` +
  `work from, so completeness and exact line references matter more than prose. Read-only on the repo. `

const OUT = {
  type: 'object',
  properties: { path: { type: 'string' }, headline: { type: 'string' }, risks: { type: 'string' } },
  required: ['path', 'headline', 'risks'],
}

phase('Inventory')
const out = await parallel([
  () => agent(
    BASE + `The app's SVG map (d3 projection + d3.zoom on an <svg>, a reprojected <canvas> for satellite) is being ` +
    `replaced by a WebGL globe engine whose API is specified in ${S}/work/globe/SPEC.md (read it). Read ALL of the ` +
    `script in /home/user/atlas-game/public/index.html (lines ~2681–8222) plus the map-related CSS (lines ~720–1160, ` +
    `~1660–1830) and write ${S}/maps/map-port-checklist.md containing:\n` +
    `1. Every function that touches the map (state.svg, state.mapG, state.projection, state.pathGen, ` +
    `state.currentTransform, state.zoomBehavior, d3.select/selectAll on .country/.city-dot/etc., #world-map, ` +
    `#sat-canvas, the sat* functions) — function name, line range, what it does to the map, and the globe-API ` +
    `call(s) that replace it.\n` +
    `2. Every visual state a feature or city dot can be in, per mode and per map style (parchment, satellite, ` +
    `Uncharted/no-borders), with the exact colours/opacities/strokes/animations from the CSS — as a table that ` +
    `maps each to a globe style name + rgba value (so the new palette reproduces today's look), noting which are ` +
    `persistent and which are timed flashes (with durations from the JS).\n` +
    `3. Per game mode (world-country, each continent, daily-five, us-state, the capital modes, us-city, province, ` +
    `province Learn mode, city-pin; plus review mode, focus practice, the resize handler, keyboard shortcuts): ` +
    `how the map is set up today (which features are drawn, which are eligible, how the view is framed) and what ` +
    `the globe equivalent should be (layers, fit target, context layer). Flag anything that only made sense on a ` +
    `flat map (Albers insets and their frames, translateExtent, the sphere/us-ocean backdrops, conic parallels, ` +
    `counter-scaling by 1/k) and what replaces it.\n` +
    `4. Overlay work: reveal markers/rings, city dots, pin guess/truth/line/labels, Learn-mode labels and their ` +
    `collision/placement algorithm (describe it precisely — it must be re-implemented against project()), the ` +
    `"zoom in to see every name" hint.\n` +
    `5. Everything that becomes dead code or dead CSS after the port (names + line ranges).\n` +
    `6. Subtle behaviours that are easy to lose: click precedence between tiny-feature hit zones and neighbours, ` +
    `interactionLocked timing, hard mode not keeping marks, Uncharted flashes, satellite failure fallback and its ` +
    `toast, the Esri credit line, per-game zoom reset, restoring marks after resize, review mode restoring marks, ` +
    `anything that reads the transform's k.\n` +
    `Verify line numbers with grep before you write them.`,
    { label: 'inventory:map-port', phase: 'Inventory', schema: OUT }),
  () => agent(
    BASE + `The app is getting a full visual redesign and a new information architecture (home with sections, a ` +
    `level sheet, stats page, settings, explore). Read ALL of /home/user/atlas-game/public/index.html — the CSS ` +
    `(lines 38–2479), the markup (2481–2678) and every function that builds or mutates UI — and write ` +
    `${S}/maps/ui-inventory.md containing:\n` +
    `1. Every screen, sub-view, modal, overlay and transient element (toast, loading overlay, banners), with its ` +
    `DOM ids/classes, the function(s) that render it (name + line range) and every state it can be in.\n` +
    `2. The menu tree exactly as it is (state.menuView values, every card, its data-region/startArg, its label ` +
    `strings, what "best" line it shows and where that comes from), including the Daily card's states ` +
    `(unplayed / played / countdown) and the sync entry.\n` +
    `3. Every setting and where it is stored (localStorage keys, values, defaults) and where its control lives.\n` +
    `4. Every localStorage key the app reads or writes, with its shape (one example each) — records, focus, pin, ` +
    `learn, daily attempts, sync — and exactly which numbers a stats page could compute from them today.\n` +
    `5. The results screen: every element, every mode-specific variation (daily, practice, learn, pin), every ` +
    `button and when it shows.\n` +
    `6. The game HUD: header stats and how labels change per mode, the prompt panel variants (capital choices, ` +
    `pin prompt, learn study prompt), controls and when each shows, keyboard shortcuts.\n` +
    `7. All user-facing strings that carry the brand voice (so the redesign keeps or deliberately changes them).\n` +
    `8. CSS architecture: tokens, breakpoints/media queries (list every one with its line), z-index layers, ` +
    `animations/keyframes, fonts and weights actually used; and a list of selectors that the JS toggles by name ` +
    `(classList/className/style.display writes) — these are the contracts a restyle must not break.\n` +
    `9. Accessibility facts: roles/aria present, focus handling in modals, colour-contrast risks you can see.\n` +
    `Verify line numbers with grep before you write them.`,
    { label: 'inventory:ui', phase: 'Inventory', schema: OUT }),
])
return out.filter(Boolean)
