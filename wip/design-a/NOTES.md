# Mockup A — "Editorial Atlas"

Light-first and typographic: a typeset modern atlas. Cormorant Garamond carries titles, the prompt and
every big numeral; Inter carries everything you operate. Structure comes from hairline rules and
whitespace, cards are quiet surfaces one step lighter than the page, and gold is the only accent.
Night Chart is the same system on ink-navy.

## Files

| File | What it is |
|---|---|
| `index.html` | The built, self-contained mockup (843 KB, most of it globe path data). Open this. |
| `src/styles.css` | All CSS, tokens first. **This is the file to lift from.** |
| `src/body.html` | Markup for the seven screens, with `{{placeholders}}` for generated parts. |
| `src/icons.html` | Icon sprite (30 stroke icons) and the shared globe gradients. |
| `build.js` | Assembles `index.html`; generates the level cards, stats rows and calendar from data. |
| `globes.js` | Orthographic globe artwork from world-atlas with d3-geo (placeholder for the WebGL globe). |
| `shoot.js` | Takes every screenshot through the harness. `contrast.js` prints the WCAG ratios below. |

Rebuild with `node build.js`, reshoot with `NODE_PATH=/opt/node-tools/node_modules node shoot.js`.

Screens switch on the URL hash: `#home`, `#sheet`, `#game`, `#results`, `#stats`, `#explore`, `#settings`.
`?theme=dark` gives Night Chart, `?sync=setup` shows Settings before sync is set up. The theme button
in the top bar, the theme tiles, segmented controls and switches all respond to clicks.

## Tokens

Brand palette is unchanged (`--parchment`, `--ink`, `--gold`, `--sepia`, `--moss`, `--sienna`, ...). The
semantic layer below is what components use; only this layer changes between themes.

| Token | Parchment | Night Chart | Use |
|---|---|---|---|
| `--bg` | `#f7f1e3` | `#101824` | Page |
| `--surface` | `#fdfaf2` | `#172131` | Cards, sheets, panels |
| `--surface-sunk` | `#f0e8d6` | `#0c131d` | Control tracks, the sheet's play column |
| `--seg-on` | `#fdfaf2` | `#2a3850` | Selected segment |
| `--inverse` / `--on-inverse` | `#1f2a3a` / `#f4ecd9` | `#1f2c42` / `#f4ecd9` | The Daily Five card |
| `--text` / `--text-2` / `--text-3` | `#1f2a3a` / `#4b566a` / `#6b6453` | `#ece4d0` / `#b4bcc9` / `#8d98aa` | Three text tiers |
| `--rule` / `--rule-strong` | ink at 12% / 28% | parchment at 12% / 30% | Hairlines |
| `--accent` / `--accent-text` | `#c8953c` / `#855a10` | `#e0a84a` / `#e0a84a` | Gold as a mark / gold as text |
| `--primary` / `--on-primary` | `#1f2a3a` / `#f7f1e3` | `#ece4d0` / `#141d2b` | Primary button, toast |
| `--good` / `--second` / `--bad` | `#44663a` / `#c8953c` / `#a0311e` | `#93c47d` / `#e0a84a` / `#e58a73` | First try / second try / missed |
| `--m0` … `--m3` | `#e4d9c1` `#a2bd80` `#5f8f47` `#2f5526` | `#283548` `#3f6549` `#5f9a55` `#a8d68b` | Mastery: new, learning, familiar, mastered |
| `--h0` … `--h4` | parchment to ink | navy to parchment | Activity heat, Pin the City bars |
| `--g-*` | ocean `#cfe0e4→#7d9fab`, land `#f5ebd4` | ocean `#2a5270→#0c1f33`, land `#3e4f66` | Globe: ocean stops, land, borders, graticule, limb, found / second / missed / wrong / selected |

Also: `--font-display` (Cormorant Garamond), `--font-ui` (Inter); space `--s1…--s20` on a 4/8 rhythm;
radius `--r-xs 6`, `--r-sm 10`, `--r-md 14`, `--r-lg 20`, `--r-pill`; `--shadow-1/2/3`; `--focus`.

Type scale: `.display-xl` 76 (52 on phones), `.display-l` 48, `.display-m` 34, `.display-s` 26, card
title 24, body 15, small 13, `.eyebrow` 11 caps with 0.12em tracking. Numerals use `.num` (Cormorant,
lining figures); columns of numbers use tabular figures.

Contrast (from `contrast.js`): every text tier is AA on every surface in both themes. The lowest pairs
are `--text-3` on `--surface-sunk` at 4.82:1 (light) and `--text-3` on `--surface` at 5.55:1 (dark).
Gold fails as text on parchment (2.6:1), which is why `--accent-text` exists.

## Components

- **Chrome**: `.topnav` (desktop, sticky, glass) and `.tabbar` (phone, four tabs). Game and Results hide both.
- **Buttons**: `.btn` with `--primary`, `--secondary`, `--ghost`, `--inverse`, `--danger`, `--xl`, `--block`; `.icon-btn` (44px).
- **Controls**: `.seg` segmented control, `.switch`, `.chip` (with `aria-current`), `.tag`, `.search`, `.radio`.
- **Mastery**: `.ring` (one element, three conic tiers from `--a/--b/--c`), `.mbar` (segmented bar sized by `--n`), `.swatch`, `.legend`, `.steps`.
- **Level card** `.level`: one element that is a card on desktop and a list row on phones. Variants `--feature` (collection lead, with a mini globe) and `--wide` (Name It, regions as chips). States `.is-new`, due hint `.level-due` / `.is-weak`.
- **Home**: `.masthead` + `.summary`, `.daily` (with `.week` strip), `.review`, `.playbar`, `.collection-head`.
- **Sheet** `.sheet`: centred two-column dialog on desktop, bottom sheet with a pinned Start on phones. `.breakdown`, `.bests` table, `.mode` radio cards.
- **Globe**: `.stage`, `.globe`, `.miniglobe`, `.lineglobe`, `.g-label`, `.g-capital`, `.mapctl`, `.glass`.
- **Game**: `.gamebar` (with a 2px progress line), `.prompt`, `.toast`, `.skip`, `.game-legend`.
- **Results**: `.score-ring` (three-arc donut), `.badge-record`, `.outcomes`, `.gain`, `.revisit` rows with `.mark` and `.tries`.
- **Stats**: `.kpis`, `.panel`, `.regions`, `.cal` (12-week heat calendar), `.bars` (with gridlines and an axis), `.weak` with `.meter`, `.records` table that collapses to rows on phones.
- **Explore**: `.explore-panel`, `.place` (flag, `.facts`, neighbors, mastery, `.skill`), `.toggle-chip`.
- **Settings**: `.settings-group`, `.settings-card`, `.setting`, `.theme-tile`, sync linked and set-up states.

## The three decisions I'm proudest of

1. **One mastery scale, used everywhere.** New → learning → familiar → mastered is a single moss ramp
   that appears as the ring on every level card, the bar in every collection header, the sheet
   breakdown, the results "+6", the stats bars and the mastery globe, where the land literally greens
   up as you learn it. It is ordinal (one hue, lightness steps), adjacent steps clear the colour-blind
   and normal-vision separation checks, and every use sits beside a count so it never relies on colour
   alone. Gold stays free to mean "act here" and nothing else.
2. **The level card is one element with two layouts.** The same markup is an editorial card on desktop
   (title, count, ring, a ruled footer with best and due) and a 72px list row inside a grouped list on
   phones. Thirty-one levels stay scannable on a phone, and the real app renders one template.
   Collections alternate a lead card plus six with rows of three, so the long page has rhythm without
   any decoration.
3. **The globe is the only picture, and the type does the rest.** No boxes-in-boxes, no texture, no
   dashed borders. Hierarchy is carried by Cormorant numerals against small-caps Inter labels and by
   hairlines. The cartographic touches are few and functional: coordinates as metadata on the sheet
   and place card, italic sea names in Explore, a compass mark, a line-art globe behind the Daily Five.

## Where it is still weak

- **The globe is a static SVG stand-in.** Shading, limb and atmosphere are gradients. The WebGL globe
  will not match exactly, and label placement here is hand-tuned per screenshot; there is no collision
  handling. On phones the Explore labels around Chile, Argentina and Uruguay are crowded.
- **Home is long on phones** (about 4,400px). The collection chips are meant to jump or filter, but
  they are not wired, and collapsing collections was not explored.
- **Featured-card mini globes** cost roughly 30 KB of path data each. In the app they should come from
  the engine or be dropped.
- **Results in a short desktop window**: at 1280×800 the seventh revisit row ends 74px from the bottom,
  so anything longer scrolls. The hero column does not stick while the list scrolls.
- **Pin the City and Name It are thinner than the rest.** Their cards and the stats bars exist, but
  there is no game or results mock for either mode, and Daily Five has no "already played" state.
- **Mastery ramp vs the dataviz checks**: the lightest step is 1.99:1 on the light surface and the
  brand moss sits under the categorical chroma floor. Acceptable for an ordinal ramp with visible
  counts, but it is muted by design.
- **Engine features assumed**: `color-mix()` (two uses), conic-gradient with a mask for rings,
  `backdrop-filter` for glass, and `text-wrap: balance`. All degrade safely, but none were tested
  outside headless Chromium.
- **Not designed**: empty states for a first-run player (everything at zero), the confirm dialog for
  Reset progress, the search results list, loading and offline states, and the 761–1080px tablet range
  beyond checking that nothing overflows.
