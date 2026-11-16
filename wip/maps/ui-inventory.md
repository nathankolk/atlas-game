# UI inventory — `public/index.html`

Source: `/home/user/atlas-game/public/index.html`, 8,225 lines, commit `1c74e1d` (md5 `90c0e7560685…`).
`L123` = line 123 of that file. Ranges are inclusive. Every line number below was taken from a
numbered read of the file or from `grep -n`; anything marked **[run]** was also confirmed in the
harness browser (scripts in `$S/work/ui-inventory/`), **[read]** means by reading only.

File map: head/meta L1–37 · CSS L38–2479 · markup L2481–2677 · CDN scripts L2679–2680 · one IIFE L2681–8222.

Contents: 0 Defects found · 1 Screens & transient elements · 2 Menu tree · 3 Settings · 4 Storage & stats ·
5 Results screen · 6 Game HUD · 7 Brand-voice strings · 8 CSS architecture & JS contracts · 9 Accessibility ·
10 Function index

---

## 0. Defects and quirks found while inventorying (read this first)

These change what the redesign has to do, so they are up front. None are fixed; the repo was not touched.

| # | What | Where | Evidence |
|---|------|-------|----------|
| D1 | **The brand header is invisible on the main menu at normal window sizes.** `#menu-screen` is a column flexbox with `justify-content: center` + `overflow-y: auto`; when the content is taller than the viewport the overflow is split above and below, and the part above scroll origin cannot be scrolled to. At 1280×900 the `.title` sits at y −203…−115 with `scrollTop` 0; at 390×844 it is at −272; at 1280×720 at −293. The first thing on screen is "Choose Your Study". A short sub-view (United States at 1280×900) does fit, and there the scaled-down, 55 %-opacity header shows. | L128–133 | **[run]** `probe2.js`; screenshot `$S/shots/ui-inventory/A1-menu-main.png` |
| D2 | **Same clipping on the results screen** whenever bests + revisit list make it taller than the viewport: 390×844 → "Expedition Complete" at y −73, title top −27; 1280×720 → brand −48, title top −18. | L1285–1290 | **[run]** `probe3.js` |
| D3 | **"Best" never shows on the Capitals → States and States → Capitals cards**, and the US folder's best only ever reflects The Fifty States. The menu looks records up under region `'The United States'` (L4224, L3955) but those two modes save under their own label (`'US Capitals → States'`, `'US States → Capitals'`, via L4506 + L3497/L3503). | L4224, L3947–3962 | **[run]** seeded all three keys; only "The Fifty States" showed a best (`A2-menu-us.png`) |
| D4 | **The daily streak chip never shows on the unplayed card.** `calculateDailyStreak()` counts back from *today* and stops at the first missing day, so it is 0 until today is played; the unplayed card shows it only when `> 0`. After playing it shows only when `> 1`. | L3449–3464, L4055, L4035 | **[run]** seeded yesterday's attempt: no `.daily-streak` on the fresh card |
| D5 | **Australia is not in the game** when the primary 50m world file loads: world-atlas 50m gives id `036` to both "Australia" and "Ashmore and Cartier Is."; `featureKey()` is `'id:036'` for both and the second overwrites the first's name/continent with a non-country. Result: Oceania is 6 countries, the World card says "183 countries", Australia is drawn greyed-out. (With the 110m fallback Australia is present but 11 small states are missing: World = 173.) French Guiana is listed in `CONTINENTS` but has no feature in either file. The self-hosted copy `public/data/countries-50m.json` (in the repo, not yet referenced by `index.html`) carries the same duplicate id, so the bug moves with it unless features stop being keyed by id alone. | L3618–3620, L3790–3799 | **[run]** Oceania round had 6 questions, none Australia; logic replicated over both files in node |
| D6 | **Load-failure message can never appear.** `init()`'s catch writes to `#regions-container`, which does not exist (the container is `#menu-content`) → TypeError; the menu stays on "Unfurling the world map…" forever. | L3809–3814 | **[read]** id appears once in the file (L3809) |
| D7 | **`?play=midwest-cities` / `south-cities` / `west-cities` open an empty game.** Slugs exist for the three "coming soon" levels; the link starts a round with 0 questions, lands on results "0 % · 0/0" and writes a `us-city\|Midwest\|normal` record and an empty focus list. | L3831–3833, L4639 | **[run]** `probe2.js` |
| D8 | **"Zoom in to see every name" pill disappears after 5 s** even while names are still hidden: `#learn-hint` reuses `.zoom-hint`, whose `hintFade` animation ends at opacity 0. | L2567, L1009–1032 | **[read]** |
| D9 | **Every `renderMenu()` replays the entrance animation**: all menu blocks start at `opacity: 0` and fade up with 0.5–0.97 s delays. Clicking a difficulty segment or the satellite switch, a sync pull finishing, or returning from a game blanks the menu for half a second. Cards past the 7th have no stagger rule. | L148–239, L398–409, L2172; callers L7365, L7374, L7956, L7586 | **[read]** |
| D10 | **US Cities folder card lays out as one row** ("US Cities ▸ find cities region by region 4 regions to study"): it has `.folder-card` (`display: flex !important`) but no `.folder-icon/.folder-body/.folder-arrow` wrappers. | L4235–4239, L2066–2074 | **[run]** `A2-menu-us.png` |
| D11 | Fonts requested ≠ fonts used: no Crimson Pro italic is loaded (10 rules use it → synthesized slant), Cormorant italic is loaded at 400 only but used at 500 and 600 (faux bold); Crimson Pro 500/600 and JetBrains Mono 500 are downloaded and unused. | L37; table in §8.5 | **[read]** |
| D12 | Naming drift: results say "· Hard Mode" (L5687), share text and Pin results say "· Hard" (L7470), the picker says "Hard". | | **[read]** |
| D13 | Dead code/CSS: `GAME_MODES[*].promptLabel` and `.recordsLabelSuffix` (L3480–3528, never read); `showDailyAlreadyPlayed` is a stub (L4168–4171); `.section-divider` (L1826), `.us-section-label` (L1831–1840), `.pin-card` (class with no CSS, L4352), `data-no-action` (L4032), `.country-bg` selector that matches nothing (L4949); tokens `--parchment-deep`, `--parchment-shadow`, `--sepia-soft`, `--ocean`, `--highlight-glow` are never used. The records shape comment (L6243–6255) shows 2-part keys; real keys are 3-part. | | **[read]** |
| D14 | Sync gaps that matter to a stats page: `gamesPlayed` merges with `Math.max` (L7897), so games played on two devices between syncs are under-counted; learn progress, difficulty and map style are not in the payload; `hardMode` is sent (L7834) but never applied; merged daily attempts are not trimmed to 30 (L7854). | L7825–7869 | **[read]** |
| D15 | Zoom buttons carry `title=` (native hover tooltips) — the only tooltips in the app; the owner's rule is no hover tooltips. | L2552–2561, L5891 | **[read]** |

---

## 1. Screens, sub-views, modals, overlays, transient elements

All three `.screen`s are always in the DOM, stacked (`position: absolute; inset: 0`, L112–120) and shown by
`.active` (opacity 1 + pointer-events, L122–125; 0.6 s cross-fade). `switchScreen(name)` L7582–7592 swaps
`.active`; going to `'menu'` also calls `renderMenu()` and resets the address bar.

### 1.1 Menu screen — `#menu-screen.screen` (markup L2486–2512)

| Part | DOM | Rendered by |
|------|-----|-------------|
| Static header | `.menu-inner > .menu-header` → `.brand` (`.brand-line`, `.brand-mark`, `.brand-line`), `h1.title` (with `<em>`), `p.subtitle`, `svg.compass` (hard-coded hex fills, L2498–2507; spins 60 s) | markup L2488–2508 |
| Dynamic body | `#menu-content` (innerHTML replaced on every render) | `renderMenu()` L3981–3989 → one of 7 view renderers |
| Wiring | all `[data-action]` handlers, difficulty/satellite controls, sync entry | `attachMenuHandlers()` L4441–4482 (re-run after every render) |

States:
- **Loading**: `<div class="loading-state">Unfurling the world map</div>` + animated dots (L3995–3998; CSS L545–566). Shown until world data + topojson load.
- **Error**: `.error-state` (L3811–3814; CSS L568–577) — unreachable, see D6.
- **Main view** (`state.menuView === 'main'`).
- **Six sub-views** (`continents`, `us`, `us-cities`, `provinces`, `provinces-russia`, `pins`): `#menu-screen` gets `.view-sub` (L4444) → `.menu-header` scales to 0.6 (0.5 ≤720 px), opacity 0.55, negative bottom margin, no pointer events (L1844–1855, L2469). Each starts with `.submenu-header` (back button + title + subtitle).
- Orthogonal to the view: difficulty (3) · satellite switch (off / on / locked-on in Uncharted) · Daily card (unplayed / played+countdown) · sync entry (never / ok / error) · per-card "best" line present or not.
- `state.menuView` is not persisted; it is set by folder clicks (L4451), back buttons (L4460), `openLinkedLevel()` (L3884) and reset to main by `showDailyAlreadyPlayed` (L4169). Returning from a game re-renders whatever view it was left on.

### 1.2 Game screen — `#game-screen.screen` (markup L2515–2576)

| Region | DOM (ids / classes) |
|--------|---------------------|
| Header `header.game-header` | `.hdr-left`: `#back-btn.back-btn`, `#review-back-btn.back-btn.review-back-btn`, `#region-tag.region-tag` · `.hdr-right`: four `.stat` (first is `.stat-primary`) each `.stat-label` + `.stat-value`: `#stat-score-label`/`#stat-score.score-color`, `#stat-correct-label`/`#stat-correct.correct-color`, `#stat-wrong-label`/`#stat-wrong.wrong-color`, (label "Left", no id)/`#stat-remaining` |
| Prompt `.prompt-panel` | `.prompt-label` (no id; found by `.prompt-panel .prompt-label`, L5045, L6880), `#prompt-country.prompt-country`, `#choices-panel.choices-panel` |
| Map `#map-wrap.map-wrap` | `canvas#sat-canvas.sat-canvas`, `svg#world-map`, `.zoom-controls` (`#zoom-in-btn`, `#zoom-out-btn`, `#zoom-reset-btn`, `#map-style-btn`, all `.zoom-btn`), `#zoom-hint.zoom-hint`, `#sat-credit.sat-credit`, `#learn-hint.zoom-hint`, `#toast.toast` |
| Controls `.controls` | `#skip-btn.ctrl-btn` (with `span.ctrl-kbd`), `#learn-ready-btn.ctrl-btn.primary`, `#pin-btn.ctrl-btn.primary` |

Rendered/updated by: `startGame()` L4537–4740 (state, header label, chrome), `renderMap()` L4773–4996 (SVG),
`nextCountry()` L5032–5104 (prompt), `updateStats()` L5558–5589, `setLearnChrome()` L6840–6852 (stat labels,
which control buttons exist, `.pin-mode/.pin-hard`), `applyMapStyle()` L5883–5892 (`.sat-on/.no-borders`, style button).

States it can be in:
- **Mode** (8): `world-country`, `daily-five`, `us-state`, `us-capital-to-state`, `us-state-to-capital`, `us-city`, `city-pin`, `province` (`GAME_MODES` L3476–3530).
- **Round type**: full game · focus practice (`state.practice`) · daily replay (`state.dailyReplay`) · Learn ladder (`state.learn`, phase `study` | `quiz`) · Pin (`state.pin`, phase `aim` | `reveal`).
- **Classes on `#game-screen`**: `.review-mode` (set L7616, cleared L7620 and L4541), `.pin-mode`, `.pin-hard` (L6849–6851).
- **Classes on `#map-wrap`**: `.sat-on` (satellite wanted and imagery not failed), `.no-borders` (Uncharted) (L5886–5887).
- **Interaction lock** (`state.interactionLocked`): between an answer and the next prompt; during learn study; forever after the last answer.
- **Review mode** (results → "View Map"): `.hdr-right`, `.prompt-panel`, `.controls`, `.zoom-hint`, `#back-btn` are `display: none !important`; `#review-back-btn` ("← Results") shows (CSS L1160–1172). Map keeps its marks and zoom; only pan/zoom work. Not offered in Hard/Uncharted, Pin or Learn.
- SVG map element states: see §8.7.

### 1.3 Results screen — `#results-screen.screen` (markup L2579–2635)

Filled by `finishGame()` L5608–5764, `finishPinGame()` L6535–6629 or `finishLearn()` L7168–7202, with
`renderRecordsBanner()` L5767–5792, `renderBestsSection()` L5795–5840, `setLearnResultsLabels()` L6854–6860.
Full element/variation list in §5.

### 1.4 Sync modal — `#sync-modal-overlay.sync-modal-overlay` (markup L2638–2647)

`role="dialog" aria-modal="true" aria-labelledby="sync-modal-title"`. Inside: `#sync-modal.sync-modal` →
`.sync-modal-header` (`h2#sync-modal-title.sync-modal-title`, `p.sync-modal-subtitle`, `button#sync-modal-close.sync-modal-close` "×")
+ `#sync-modal-body.sync-modal-body`. Open/close = `.show` on the overlay (`syncOpenModal` L7993–7998,
`syncCloseModal` L7999–8002); close button, scrim click and Escape wired once in `wireSyncModalChrome()` L8202–8214.
Body is re-rendered by `syncRenderModalContent()` L8004–8014.

| View | When | Markup builder | Elements |
|------|------|----------------|----------|
| Setup · "New sync key" tab (default) | no token | `syncRenderSetupView()` L8016–8040, wired L8073–8127 | `.sync-tab-row` with two `.sync-tab[data-sync-tab]` (`.active`), `[data-sync-pane="new"]`: `.sync-help`, `.sync-section` (`label.sync-label`, `input#sync-username-new.sync-input.text`), `button#sync-create-btn.sync-btn` |
| Setup · "Import existing" tab | no token | same | `[data-sync-pane="import"]`: `.sync-help`, `input#sync-key-input.sync-input`, `button#sync-import-btn.sync-btn`, `p#sync-import-status.sync-status-line` |
| Connected | token set | `syncRenderAuthedView()` L8042–8071, wired L8129–8199 | `input#sync-username-edit`, `#sync-key-display.sync-key-display.hidden` (blurred), `.sync-key-actions` (`#sync-key-show`, `#sync-key-copy`, both `.sync-mini-btn`), `button#sync-now-btn.sync-btn`, `p#sync-status-line.sync-status-line[.error]`, `hr.sync-divider`, `button#sync-disconnect-btn.sync-btn.danger`, `.sync-help` |

Transient states: Create → "Creating..." disabled (L8087–8088) · Import → "Connecting..." disabled (L8109–8110), error lines in `#sync-import-status.error` (L8105, L8116) · Show/Hide toggles `.hidden` on the key (L8147–8151) · Copy → "✓ Copied" 1.4 s (L8161–8162), fallback `window.prompt` (L8164) · Sync Now → "Syncing..." then status "Synced HH:MM:SS" `.success` or "Sync failed: <reason>" `.error` (L8171–8187) · username edits push after 600 ms debounce (L8134–8140) · Disconnect → native `confirm` (L8193).

### 1.5 Level chooser ("focus chooser") — `#focus-modal-overlay.sync-modal-overlay` (markup L2650–2675)

Same frame classes as the sync modal. `h2#focus-modal-title`, `p#focus-modal-subtitle`, `#focus-modal-close`,
`.focus-choices` with `#focus-choice-fresh.focus-choice` (title "Fresh Game" + `#focus-choice-fresh-desc`),
`#focus-choice-focus.focus-choice.focus` (`#focus-choice-focus-title` + fixed description),
`#focus-choice-learn.focus-choice.learn` (`#focus-choice-learn-title`, `#focus-choice-learn-desc`),
`#focus-learn-reset.focus-reset-link`.
Opened by `chooseAndStart()` L7211–7220 → `openFocusChooser()` L7223–7284; closed by `closeFocusChooser()` L7286–7288;
chrome wired once L7291–7300. Handlers are assigned with `.onclick =` each open (L7261–7282).

When it opens: any non-daily level whose saved focus list is non-empty, and **every** province level (Learn lives here). Otherwise a card tap starts the game immediately.

| State | Subtitle | Buttons shown |
|-------|----------|---------------|
| Non-province, has focus list | "Your last full game here (Nov 16) left 6 to revisit." | Fresh Game · "Focus on Those 6" / "Focus on That One" |
| Province, no focus list, no ladder | "How would you like to play?" | Fresh Game · "Learn Them" |
| Province, no focus list, ladder in progress | same | Fresh Game · "Keep Learning" · link "Start learning over from one" |
| Province, has focus list (± ladder) | "Your last full game here (…) left N to revisit." | Fresh Game · Focus · Learn Them / Keep Learning (· reset link) |

Fresh description: "All {total} {noun} · counts toward your records" — total from the focus entry, else from the loaded province map (`provinceRoundSize`, 0 → omitted if that country hasn't been loaded yet this session) (L7241–7243).

### 1.6 Overlays, banners and transient elements

| Element | DOM | Function (lines) | States / timing |
|---------|-----|------------------|-----------------|
| Loading overlay | `#loading-overlay.loading-overlay` > `.loading-inner` + `span.loading-dots`; created on first use and appended to `<body>` (outside `#app`) | `showLoadingOverlay(text)` L4748–4758, `hideLoadingOverlay()` L4759–4762 | `.visible` fade 0.3 s. Texts "Loading the United States" (L4574), "Loading {Country}" (L4591). Only for lazy US/province data. Failure → native `alert` (L4579, L4596) then back to menu |
| Toast | `#toast.toast` inside `#map-wrap` | `showToast(kind, html)` L5599–5606 | `.show` for 1.4 s; kind class `correct` / `wrong` sets left border + `<em>` colour (CSS L1249–1282). One at a time; a new one replaces the text |
| Zoom hint | `#zoom-hint.zoom-hint` | shown in `startGame` L4728–4732 | Once per page load (`state.zoomHintShown`); CSS animation fades in/out over 5 s. Hidden in review mode and while the learn hint is on (L7026) |
| Learn hint | `#learn-hint.zoom-hint` | `setLearnHint(on)` L7023–7027, called from `placeLearnLabels` L7019 and `clearLearnStudy` L7116 | Shown when at least one study label had to be left off; see D8 |
| Imagery credit | `#sat-credit.sat-credit` | `satSetLoading(on)` L5938–5940 | Visible only under `.map-wrap.sat-on` (CSS L1147). Text gains the prefix "Loading imagery… · " while tiles are pending |
| Satellite failure | toast | `satDraw` L6232–6237 | If no tile at all could be drawn: `.sat-on` is removed (parchment fallback; Uncharted keeps `.no-borders`) and a `wrong` toast says so |
| New-record banner | `#new-record-banner.new-record-banner` > `.record-laurel`, `.record-text`, `.record-laurel.flipped` | `renderRecordsBanner()` L5767–5792; Pin variant L6570–6579 | `display: none` / `flex`; `recordFadeIn` 0.7 s |
| Reveal marker | SVG `g.reveal-marker` > `circle.pulse-ring`, `circle.pulse-ring.delayed`, `circle.center-dot` | `showRevealMarker` L5354–5376, `showRevealMarkerAtCoords` L5489–5506 | Pulses, fades and is removed after 2.4 s |
| Share button feedback | `#share-btn` or `.daily-share-btn` | `shareResults` L7543–7576, `shareTextOrCopy` L7516–7541 | Native share sheet if available; else clipboard + "✓ Copied to clipboard" and `.copied` for 2.2 s; else `window.prompt('Copy your results:')` |
| Daily countdown | `[data-countdown]` in the played Daily card | `startDailyCountdown()` L4141–4162 | Ticks every second while the element exists; at 0 re-renders the menu |
| Score flash | `#stat-score.score-flash` | `flashScore()` L5591–5597 | 0.6 s scale + gold |
| Prompt pulse / shake | `#prompt-country.pulse` / `.shake` | L5097–5100, L5176–5178, L5269–5271, L5418–5420, L6886–6888 | 0.6 s / 0.4 s |
| Native dialogs | — | `alert` L4579, L4596 · `window.prompt` L7539, L7573, L8164 · `window.confirm` L8193 | Unstyled; candidates for in-app replacements |

There is no: timer display, progress bar, pause, settings screen, stats screen, onboarding, empty state copy, offline banner, confirmation before leaving a game, sound.

---

## 2. Menu tree, exactly as it is

Dispatch: `renderMenu()` L3981–3989 on `state.menuView` (default `'main'`, L3582 — the comment there omits `'pins'`).
Cards are `<button class="region-card …" data-action="…">` (exceptions: the played Daily card is a `<div>`, and "coming soon" cards have no `data-action`); click handling in `attachMenuHandlers()` L4441–4482:
`data-action="play"` → `chooseAndStart(card.dataset.region)`; `"open-folder"` → `state.menuView = dataset.folder`,
re-render, scroll to top; `"back-to"` → `state.menuView = dataset.target || 'main'`.

Card anatomy (plain card): `.r-name`, `.r-subname`, `.r-count`, optional `.r-best` (gold ★ added by CSS `::before`, L517–522).
Folder card adds `.folder-icon`, `.folder-body` (wrapping the four lines), `.folder-arrow` "›".

**Where "best" lines come from**
- `bestLabel(region, gameMode)` L3915–3928 → `atlas-records[gameMode|region|<current difficulty>]`: "Perfect · m:ss" if best accuracy is 100 % and a clean-sweep time exists, else "Best: c/t"; then " · N pts" if a best score exists. Changes when the difficulty picker changes.
- `folderBestLabel(folder)` L3933–3979 → highest `bestAccuracy.pct` among the folder's levels at the current difficulty: "Best: {child} {pct}%"; else "{n} games played"; else nothing.
- `pinBestLabel(region)` L6759–6764 → `atlas-pin` games for that region at the current difficulty: "Best 1,640" + " · avg 1,420" (mean of the last 10) once there are 2+ games.

### 2.1 `main` — `renderMainMenu()` L3992–4136

In order:
1. `.section-label` → "Choose Your Study" (L4010)
2. Difficulty picker + satellite switch — `renderModeToggles()` (L4012; §3)
3. Sync entry — `renderSyncEntry()` (L4013; §2.8). **Main view only.**
4. `.regions` grid:

| # | Card | Classes / attributes | Lines | Name · sub-line · count line | Best line |
|---|------|----------------------|-------|------------------------------|-----------|
| a | Daily Five | see §2.7 | L4017–4061 | | |
| b | Whole World | `.region-card.featured` `data-action="play" data-region="World"`; `.featured-left` > `.featured-mark` "✦" + text block; `.featured-cta` "Begin Grand Tour →" | L4064–4076 | "The Whole World" · "every continent, every nation" · "{worldCount} countries · all regions" (183 with the 50m data, see D5) | `bestLabel('World', 'world-country')` |
| c | By Continent | `.region-card.folder-card` `data-action="open-folder" data-folder="continents"`; icon "⌖" | L4079–4089 | "By Continent" · "study one region at a time" · "6 continents" | `folderBestLabel('continents')` — six continents, not World; child label = continent name |
| d | United States | `… data-folder="us"`; icon "★" | L4092–4102 | "The United States" · "states, capitals, and more" · "3 study modes" | `folderBestLabel('us')` — labels "States", "Cap→St", "St→Cap"; see D3; US Cities not included |
| e | Pin the City | `… data-folder="pins"`; icon "⌾" | L4105–4116 | "Pin the City" · "a blank map · scored by how close you land" · "120 cities · 6 continents" (`PIN_CITY_BY_NAME.size`) | "World " + `pinBestLabel('World')` |
| f | Provinces & States | `… data-folder="provinces"`; icon "❖" | L4119–4129 | "Provinces & States" · "Canada, China, India, and Russia" · "4 nations" | `folderBestLabel('provinces')` — all six rounds; child label = `round.short` ("Canada", "China", "India", "Russia W/S/E") |

### 2.2 `continents` — `renderContinentsMenu()` L4174–4194

Header "By Continent" / "Six regions of the known world" (back → main). Toggles. Six `.region-card` `data-action="play" data-region="{Continent}"` in `CONTINENT_ORDER` (L3899):

| data-region | Sub-line (L3900–3911) | Count line ("{n} countries to study", from `countEligibleInContinent`) with 50m data |
|-------------|-----------------------|------|
| `Africa` | "№ I — the cradle of nations" | 54 |
| `Asia` | "№ II — the vast eastern lands" | 48 |
| `Europe` | "№ III — the old continent" | 39 |
| `North America` | "№ IV — north of the equator" | 23 |
| `South America` | "№ V — below the line" | 13 |
| `Oceania` | "№ VI — islands of the Pacific" | 6 (7 once D5 is fixed) |

Best: `bestLabel(continent, 'world-country')`.

### 2.3 `us` — `renderUsMenu()` L4197–4243

Header "The United States" / "A closer study of the fifty states" (back → main). Toggles. Cards are `.region-card.us-card`:

| data-region (= mode key) | Name | Sub-line | Count line | Best |
|--------------------------|------|----------|------------|------|
| `us-state` | "The Fifty States" | "find each state on the map" | "50 states to study" | `bestLabel('The United States', mode)` |
| `us-capital-to-state` | "Capitals → States" | "capital given, find the state" | "50 capitals to place" | same call — never matches (D3) |
| `us-state-to-capital` | "States → Capitals" | "state given, name its capital" | "50 capitals to recall" | same call — never matches (D3) |
| folder → `us-cities` (`.us-card.folder-card`, `data-action="open-folder"`) | "US Cities ▸" | "find cities region by region" | "4 regions to study" | none; layout quirk D10 |

### 2.4 `us-cities` — `renderUsCitiesMenu()` L4248–4291

Header "US Cities" / "Four regions of the United States" (back → `us`). Toggles.

| data-region | Name | Sub-line | Count line | State |
|-------------|------|----------|------------|-------|
| `northeast-cities` | "Northeast Cities" | "9 states · NY, MA, PA, and neighbors" | "40 cities to find" | playable; best `bestLabel('Northeast', 'us-city')` |
| (`midwest-cities`) | "Midwest Cities" | "12 states · OH, IL, MI, and neighbors" | "coming soon" | `<button class="region-card us-card disabled" disabled>`, no data-action |
| (`south-cities`) | "Southern Cities" | "16 states + DC · TX, FL, GA, and neighbors" | "coming soon" | disabled |
| (`west-cities`) | "Western Cities" | "13 states · CA, WA, AZ, and neighbors" | "coming soon" | disabled |

Only Northeast has city data (`US_CITIES_BY_REGION`, L2956–3009).

### 2.5 `provinces` and `provinces-russia`

`renderProvincesMenu()` L4310–4330: header "Provinces & States" / "The inner divisions of great nations" (back → main). Toggles.
`renderRussiaMenu()` L4368–4380: header "Russia" / "Eleven time zones in three rounds" (back → `provinces`). Toggles.
Round cards from `renderProvinceRoundCard(roundKey)` L4294–4306: `.region-card.province-card data-action="play" data-region="{roundKey}"`,
count line "{count} {country noun, lower-cased} to find", best `bestLabel(roundKey, 'province')`. Data: `PROVINCE_ROUNDS` L3255–3280, nouns `PROVINCE_COUNTRIES` L3223–3248.

| View | data-region | Name | Sub-line | Count line |
|------|-------------|------|----------|------------|
| provinces | `canada-provinces` | "Provinces of Canada" | "ten provinces and three territories" | "13 provinces & territories to find" |
| provinces | `china-provinces` | "Provinces & Regions of China" | "provinces, regions, municipalities & SARs" | "33 provinces & regions to find" |
| provinces | `india-states` | "States of India" | "twenty-eight states and eight territories" | "36 states to find" |
| provinces | folder → `provinces-russia` (`.province-card`, not `.folder-card`) | "Russia ▸" | "83 federal subjects in three rounds" | "3 regions to study"; best `folderBestLabel('provinces-russia')` |
| provinces-russia | `russia-west` | "Central & Northwest Russia" | "Moscow, St. Petersburg, and the Arctic west" | "29 regions to find" |
| provinces-russia | `russia-south` | "Southern Russia & the Volga" | "the Caucasus, the Black Sea, and the Volga" | "27 regions to find" |
| provinces-russia | `russia-east` | "Urals, Siberia & the Far East" | "from the Urals to the Pacific" | "27 regions to find" |

### 2.6 `pins` — `renderPinsMenu()` L4333–4365

Header "Pin the City" / "A blank map, a city name, and a pin" (back → main). Toggles with **Pin-specific difficulty descriptions** (L4337–4341, §3).
Seven `.region-card.pin-card data-action="play" data-region="{key}"` from `PIN_ROUNDS` (L3169–3177); count line "20 cities · 2,000 pts"; best `pinBestLabel(region)`:

| data-region | Name | Sub-line (first three cities + "…") |
|-------------|------|-------------------------------------|
| `pin-world` | "The Whole World" | "a mix from every continent" (20 drawn from all 120) |
| `pin-africa` | "Africa" | "Cairo, Lagos, Kinshasa…" |
| `pin-asia` | "Asia" | "Tokyo, Delhi, Shanghai…" |
| `pin-europe` | "Europe" | "Moscow, London, Paris…" |
| `pin-north-america` | "North America" | "Mexico City, New York, Los Angeles…" |
| `pin-south-america` | "South America" | "São Paulo, Buenos Aires, Rio de Janeiro…" |
| `pin-oceania` | "Oceania" | "Sydney, Melbourne, Brisbane…" |

Below the grid: `.pin-scoring-note` → "100 points within 25 km of the city · 83 at 100 km · 57 at 250 km · 30 at 500 km · 9 at 1,000 km" (L4360–4362, computed from `pinPoints`).

### 2.7 Daily card states (L4017–4061)

Inputs: `todayUtcKey()` (UTC date, L3344–3350), `getDailyAttempt(dateKey)`, `dailyPuzzleNumber()` (days since 2026-04-26, +1; L3365–3370), `calculateDailyStreak()`.

| State | Element | Contents |
|-------|---------|----------|
| **Unplayed** | `<button class="region-card daily-card daily-fresh" data-action="play" data-region="daily-five">` | `.daily-header` > `.daily-badge` "Daily #N" (+ `.daily-streak` "🔥 N day streak" if streak > 0 — never, D4) · `.r-name` "The Daily Five" · `.r-subname` "five countries · today's puzzle for the world" · `.daily-cta` "Play Today's Puzzle →" |
| **Played** | `<div class="region-card daily-card daily-done" data-no-action="1">` (not a button) | `.daily-header` (badge; streak if > 1) · `.daily-done-msg` "Today's puzzle complete" · `.daily-result-grid` five emoji (🟩 first try, 🟨 second, 🟥 missed, from `attempt.sequence`) · `.daily-result-stats` "c/5 found · S pts · P%" · `.daily-actions`: `button.ctrl-btn.share.daily-share-btn[data-action="share-daily"]` "Share Result", `button.ctrl-btn.daily-replay-btn[data-action="replay-daily"]` "Practice Replay" · `.daily-next` "Next puzzle in `<span data-countdown>`HH:MM:SS`</span>`" |
| **Countdown** | the `[data-countdown]` span | to next UTC midnight; when it reaches 0 the menu re-renders and the card flips to Unplayed |

One attempt per UTC day regardless of difficulty; the attempt records the difficulty it was played at. "Practice Replay" → `startDailyReplay(today)` (same five countries, nothing saved, header "Daily #N (Practice)").

### 2.8 Sync entry (main view only)

`renderSyncEntry()` L7965–7979 → `.sync-entry-row > button#sync-entry-btn.sync-entry-btn.{never|ok|error}` with `span.sync-glyph` "⛓", `span.sync-entry-label` and `span.sync-status-dot`:

| Class | When | Label | Dot |
|-------|------|-------|-----|
| `never` | no token | "Set up sync" | hidden |
| `ok` | token, no `lastError` | "Sync" | moss green |
| `error` | token and `meta.lastError` | "Sync" | red `#b85a5a` |

Click → `syncOpenModal()` (wired by `wireSyncEntryButton()` L7981–7985).

### 2.9 Level links (deep entry into the tree)

`linkSlugs()` L3828–3835 → 28 slugs: `world`, `daily`, `africa`, `asia`, `europe`, `north-america`, `south-america`, `oceania`, `us-state`, `us-capital-to-state`, `us-state-to-capital`, `northeast-cities`, `midwest-cities`, `south-cities`, `west-cities`, the six province keys, the seven `pin-*` keys. `?play=<slug>` → `openLinkedLevel()` L3874–3891 sets `state.menuView` to the level's folder (`menuViewForStartArg` L3861–3871), renders it, then behaves like a card tap (chooser if applicable); `&learn=1` on a province slug starts Learn directly. Unknown slug → address bar reset to the base URL. While a game is open the address bar is `?play=<slug>[&learn=1]` (L4711); back on the menu it is the bare URL (L7587).

---

## 3. Settings: what exists, where it is stored, where its control lives

| Setting | In-memory | localStorage key → values (default) | Load / save | Control |
|---------|-----------|--------------------------------------|-------------|---------|
| Difficulty | `state.difficulty`; `state.hardMode = difficulty !== 'normal'` (L7334–7337) | `atlas-difficulty` → `'normal'` \| `'hard'` \| `'uncharted'` (default `'normal'`; if absent, legacy `atlas-hard-mode === 'true'` → `'hard'`) | `loadDifficulty` L7319–7325, `saveDifficulty` L7327–7332 (also writes the legacy key), applied at startup L7354 | `.difficulty-picker[role=group]` > `.difficulty-segs` > three `button.difficulty-seg[data-difficulty][aria-pressed]` + one `span.switch-desc` description, built by `renderModeToggles()` L4407–4437 on **every menu view**; wired at L7360–7367 inside `initModeToggles()` (click → save → full `renderMenu()`). Not changeable in a game |
| Legacy hard flag | — | `atlas-hard-mode` → `'true'` \| `'false'` (mirror of difficulty ≠ normal) | L7311–7317, L7330 | none; still sent in the sync payload (L7834) |
| Map style | `state.mapStyle` | `atlas-map-style` → `'parchment'` \| `'satellite'` (default `'parchment'`) | `loadMapStyle` L7339–7345, `saveMapStyle` L7347–7351, startup L7355 | (a) Menu: `label.mode-toggle[.is-locked]` > `input#satellite-toggle[type=checkbox]` + `.switch-box > .switch-knob` + `.switch-text` (`.switch-title` "Satellite Map", `.switch-desc`), L4422–4434, handler L7368–7376. In Uncharted it is checked + disabled + `.is-locked`, text "Always on in Uncharted". (b) In game: `#map-style-btn` / key **M** → `toggleMapStyle()` L5895–5902; button hidden in Uncharted (CSS L1151) |
| Sync key | — | `atlas-sync-token` → 32 hex chars (absent by default) | L7769–7781 | Sync modal (create / import / disconnect) |
| Sync username | — | `atlas-sync-username` → free text (absent; placeholder "Cartographer") | L7782–7787 | Sync modal inputs |
| Sync status | — | `atlas-sync-meta` → `{"lastSyncAt": 1794790000000, "lastError": null}` (default `{lastSyncAt: 0, lastError: null}`) | L7788–7798 | read-only: entry-button dot, modal status line |

Difficulty text shown under the picker — default set `DIFFICULTY_INFO` L4398–4402: Normal "Found targets stay marked on the map" · Hard "No process of elimination — completed targets stay unmarked" · Uncharted "Satellite only, no borders — a shape shows only once you answer". Pin view overrides (L4338–4340): "Country borders drawn, no names" · "No borders — just coastlines and your memory" · "Satellite only, no borders".

What difficulty changes: which records/pin bests are read and written (key suffix); whether answered targets stay green/red (`!state.hardMode`, e.g. L5258, L5314); Uncharted forces satellite and adds `.no-borders`; Pin + Hard adds `.pin-hard` (no borders on parchment); "View Map" is hidden when `hardMode`; every "best" line on the menu.

Per-session only (not stored): `state.menuView`, `state.zoomHintShown`, `sat.failed`.

Not present at all: theme, reduced motion, sound, units (km only), language, reset/export/import of progress (the only destructive control is "Start learning over from one" in the chooser), any way to delete records.

---

## 4. localStorage: every key, its shape, and what a stats page can compute today

Eleven keys, all `atlas-*`. No sessionStorage, cookies, IndexedDB or service worker. Every access is wrapped in try/catch and fails silent (private mode → nothing persists, no message).

| Key | Const / lines | Written when | Synced |
|-----|---------------|--------------|--------|
| `atlas-records` | `RECORDS_KEY` L6258; L6260–6273 | end of every full, non-practice game except Pin and Learn (`commitSessionRecords` L6295–6348, called L5637); sync merge L7845 | yes (`records`) |
| `atlas-focus` | `FOCUS_KEY` L6371; L6373–6401 | end of every full non-daily, non-Pin game (L5651), even when the list is empty | yes (`focusLists`) |
| `atlas-pin` | `PIN_KEY` L6674; L6679–6703 | end of every Pin round (L6544) | yes (`pin`) |
| `atlas-learn` | `LEARN_KEY` L6779; L6781–6812 | Learn start (L6834), each level cleared (L7156); entry deleted when the ladder is finished (L7170) | **no** |
| `atlas-daily-attempts` | `DAILY_KEY` L3422; L3424–3446 | end of the real daily (L5659–5672); trimmed to the newest 30 dates on save (L3436) | yes (`dailyAttempts`) |
| `atlas-difficulty` | L7321, L7329 | picker click | no |
| `atlas-hard-mode` | L7313, L7330 | picker click | value sent, never applied |
| `atlas-map-style` | L7341, L7349 | menu switch, in-game button, M key | no |
| `atlas-sync-token` | L7763 | create / import; removed on disconnect | — |
| `atlas-sync-username` | L7764 | modal inputs; removed on disconnect | yes (`username`) |
| `atlas-sync-meta` | L7765 | every push/pull; removed on disconnect | — |

### 4.1 Shapes (real values captured from a harness session, **[run]**)

**`atlas-records`** — object keyed `"<gameMode>|<region>|<difficulty>"` (`recordsKeyFor` L6277–6285):
```json
{
  "world-country|Oceania|normal": {
    "gamesPlayed": 1,
    "bestScore":    { "value": 0, "max": 12, "date": "2026-11-16" },
    "bestAccuracy": { "correct": 0, "total": 6, "pct": 0, "date": "2026-11-16" },
    "lastPlayed": "2026-11-16"
  },
  "daily-five|Daily|normal": { "gamesPlayed": 1, "bestScore": { "value": 0, "max": 10, "date": "2026-11-16" }, "bestAccuracy": { "correct": 0, "total": 5, "pct": 0, "date": "2026-11-16" }, "lastPlayed": "2026-11-16" }
}
```
Optional third best, present only after a round with no misses (second tries allowed): `"bestTime": { "value": 182, "total": 23, "date": "2026-04-24" }` (seconds).
Dates are UTC `YYYY-MM-DD` (L6299). `score` is 2 per first-try find, 1 per second-try; `max = questions × 2`.

Region strings actually used in keys (from `resolveGameTarget` L4499–4523):

| gameMode | region part |
|----------|-------------|
| `world-country` | `World`, `Africa`, `Asia`, `Europe`, `North America`, `South America`, `Oceania` |
| `daily-five` | `Daily` |
| `us-state` | `The United States` |
| `us-capital-to-state` | `US Capitals → States` (contains U+2192) |
| `us-state-to-capital` | `US States → Capitals` |
| `us-city` | `Northeast` (`Midwest`/`South`/`West` reserved; D7 can create junk entries) |
| `province` | the round key: `canada-provinces`, `china-provinces`, `india-states`, `russia-west`, `russia-south`, `russia-east` |
| `city-pin` | never written here |

**Display labels are storage keys.** For the three US modes the region part is whatever `GAME_MODES[mode].label()` returns (L4506, L3491–3503); for continents, US city regions, `World` and `Daily` it is the display name. Renaming any of those strings in a redesign orphans saved records *and* focus lists (same region string, §`atlas-focus`). Province rounds are safe: their key is the round id, and their label can change freely.

A stats reader must tolerate unknown/legacy keys (the code comment shows a 2-part form) and zero-total entries.

**`atlas-focus`** — keyed `"<gameMode>|<region>"` (no difficulty):
```json
{ "world-country|Oceania": { "names": ["Vanuatu", "New Caledonia", "Fiji", "Papua New Guinea", "New Zealand", "Solomon Islands"], "total": 6, "savedAt": 1794790686008 } }
```
`names` = missed first, then found-on-second-try, from the last **full** game of that level; the two kinds are not distinguishable afterwards. Practice rounds never rewrite it.

**`atlas-pin`**:
```json
{
  "games":  [ { "at": 1794790769166, "region": "Oceania", "diff": "normal", "score": 0, "max": 2000, "avgKm": null } ],
  "cities": { "Sydney": [[1794790769166, null]], "Gold Coast": [[1794790769166, null]] }
}
```
`games` newest last, capped at 200 (`PIN_MAX_GAMES` L6675) across all regions and difficulties; `region` is `World` or a continent; `avgKm` is the rounded mean miss of non-skipped cities, `null` if all were skipped. `cities[name]` = last 5 tries `[timestamp, km | null]` (`null` = skipped), all regions and difficulties mixed.

**`atlas-learn`** — keyed by province round key; only ladders in progress:
```json
{ "canada-provinces": { "order": ["Quebec", "Saskatchewan", "Yukon", "…13 names"], "level": 1, "savedAt": 1794790770643 } }
```
`level` = the level to resume at (1…order.length).

**`atlas-daily-attempts`** — keyed by UTC date, newest 30:
```json
{ "2026-11-16": { "dateKey": "2026-11-16", "puzzleNumber": 205, "countries": ["Afghanistan", "Mexico", "Jordan", "Cameroon", "Benin"],
  "sequence": [0, 0, 0, 0, 0], "score": 0, "correct": 0, "wrong": 5, "total": 5, "timeSeconds": 32,
  "hardMode": false, "difficulty": "normal", "completedAt": 1794790732765 } }
```
`sequence[i]` is 2 / 1 / 0 for `countries[i]`. Entries from before the difficulty picker have `hardMode` only.

**Scalars**: `atlas-difficulty = "normal"`, `atlas-hard-mode = "false"`, `atlas-map-style = "parchment"`, `atlas-sync-token = "4a8e9b2c7d3f1e6a5b8c2d4e7f9a1b3c"`, `atlas-sync-username = "Cartographer"`, `atlas-sync-meta = {"lastSyncAt":1794790000000,"lastError":null}` (`lastError` values: `"network"`, `"push_<status>"`, `"pull_<status>"`).

**Sync payload** (`syncBuildPayload` L7825–7836): `{ version: 1, username, lastUpdated, records, dailyAttempts, focusLists, pin, hardMode }`, one blob per token, server cap 64 KB (`functions/api/records.js`). Merge rules L7840–7900: records per-field best wins and `gamesPlayed = max`; daily = union, local wins; focus = newer `savedAt` wins; pin = union keyed by time (`mergePinStores` L6705–6726).

### 4.2 Numbers a stats page can compute from these stores today

From **`atlas-records`** (per level × difficulty, and summed):
- Games played per level; total full games (sum of `gamesPlayed` — excludes practice, Learn and Pin; under-counts across devices, D14).
- Levels tried vs available (17 found/missed levels + Daily, × 3 difficulties); levels with a 100 % best; levels never played.
- Best accuracy per level (`correct/total`, `pct`) and the date it was set.
- Best score per level (`value/max`) and its date → first-try rate of the best game (`value / max`).
- Fastest clean sweep per level and its date; count of levels with a clean sweep.
- Last-played date per level → "days since", least-recently-played level, most recent active day.
- "Places known" proxy: sum of `bestAccuracy.correct` over the six continents (or World's), over the US modes, over the province rounds; against 183 countries (D5), 50 states, 40 Northeast cities, 165 provinces (13 + 33 + 36 + 83).
- Lifetime daily count and daily bests: the `daily-five|Daily|*` entries.
- A feed of "records set on <date>" — only the current holder of each of the three bests per level.

From **`atlas-focus`**:
- Per level: how many names the last full game left to revisit, of how many, and when (ms timestamp — the only precise "last played" for found/missed levels).
- A cross-level weak-spots list (union of `names`); count of levels with an empty list ("clean last time").
- Last-game first-try count per level = `total − names.length`.

From **`atlas-daily-attempts`** (last 30 days only):
- Today played or not; current streak (as coded, 0 until today is played — D4); longest streak within the window; days played of the last 30.
- Per day: score /10, found /5, the five-square grid, time, difficulty; averages of each; count of perfect (10/10) days; score histogram; first-try rate (share of 2s).
- A 30-day calendar strip; which countries were missed in dailies (names are stored).

From **`atlas-pin`**:
- Per region × difficulty: games, best score, last-10 average, last-10 average miss, trend (last 5 vs previous 5, `pinTrendArrow` L6632–6641) — already computed by `pinRegionStats` L6730–6741.
- **The only real time series in the app**: score and average miss per game with timestamps → sparkline/line chart, games per day, active days.
- Per city (120): last ≤ 5 misses → average miss, best/worst cities (`pinWeakestCities` L6744–6756), cities never tried, skip counts.
- Total Pin games (≤ 200 kept).

From **`atlas-learn`**: ladders in progress — "level 7 of 33" per round and when last touched. Finished ladders leave no trace.

From **sync meta**: last synced time, last error.

**Not computable today** (no data is kept): per-game history or score trend for any found/missed level; average accuracy; total time played; per-country/state/province accuracy over time; number of practice or Learn sessions; completed Learn ladders; dailies older than 30 days (beyond the lifetime count and bests); anything about abandoned games. Adding a history log is new data, and it would ride in the sync blob, which the server caps at 64 KB (`MAX_BODY_BYTES`, `functions/api/records.js` L16, compared against `text.length`). **Headroom is small**: built from the app's own shapes, a full Pin store (200 games + 120 cities × 5 tries) is ≈ 32.8 KB, records for all 18 found/missed levels at all three difficulties ≈ 14.4 KB, 30 dailies ≈ 8.6 KB — ≈ 56 KB before focus lists (a few KB more). A typical player is far below that, but a new per-game log needs compaction, a cap on entries, or a higher server limit; over the cap the push fails with 413 and the entry button turns to its error state.

---

## 5. Results screen

### 5.1 Elements (markup L2579–2635) and default text

| Element | Default |
|---------|---------|
| `.brand` > `.brand-mark` | "Expedition Complete" |
| `h1.results-title` | "Your *Findings*" (`<em>`) |
| `#results-region.results-region` | "—" |
| `#new-record-banner.new-record-banner` | hidden |
| `.results-grade` > `#grade-big.grade-big`, `#grade-unit.grade-unit` | "—", "% accuracy" |
| `.results-stats` (4 × `.r-stat` = `.r-stat-value` + `.r-stat-label`) | `#r-score.score` "0/0" / `#r-score-label` "Score" · `#r-correct.good` / `#r-correct-label` "Found" · `#r-wrong.bad` / `#r-wrong-label` "Missed" · `#r-time` "0:00" / "Time" (no id) |
| `#bests-section.bests-section` > `#bests-heading.bests-heading`, `.bests-grid` | hidden; "— Your Personal Bests —"; grid filled with `.best-item[.broken]` > `.best-value` (+ `span.best-star` "★") + `.best-label` |
| `#missed-section.missed-section` > `#missed-heading`, `#missed-list.missed-list`, `#missed-legend.missed-legend` | hidden; "— Countries to revisit —" |
| `.results-actions` | `#share-btn.ctrl-btn.share` "Share Results" · `#practice-btn.ctrl-btn.primary` "Practice These" (hidden) · `#replay-btn.ctrl-btn.primary` "Study Again" · `#daily-practice-btn.ctrl-btn.primary` "Practice Replay" (hidden) · `#view-map-btn.ctrl-btn` "View Map" (hidden) · `#home-btn.ctrl-btn` "Choose Region" |

Button handlers: L7598–7626. `#replay-btn` restarts `state.startArg` (Learn again → fresh ladder, L7603); `#practice-btn` → `startGame(startArg, { practice: state.roundNeedsWork })`; `#view-map-btn` → review mode; `#daily-practice-btn` → `startDailyReplay`; `#home-btn` → menu (same folder).

### 5.2 Variations by round type

| | Standard full game (`finishGame`) | Focus practice | Daily (real) | Daily practice replay | Learn finished (`finishLearn`) | Pin (`finishPinGame`) |
|---|---|---|---|---|---|---|
| `#results-region` | mode label (`GAME_MODES[mode].label`, L3479–3526) + " · Uncharted" / " · Hard Mode" | label + " · Practice" + difficulty | "Daily #N" + difficulty | "Daily #N (Practice)" + difficulty | "{round label} · Learn" (no difficulty) | "Pin the City · {Region}" + " · Hard" / " · Uncharted" |
| `#grade-big` / unit | accuracy % of answered / "% accuracy" | same | same | same | number of provinces / "learned" | points with thousands separator / "of 2,000 points" |
| Stat 1 | "Score" `score/max` | same | same (max 10) | same | "Levels" `N/N` | "Avg Miss" `412 km` or "—" |
| Stat 2 | "Found" | same | same | same | "Found" = N | "Within 100 km" count |
| Stat 3 | "Missed" | same | same | same | "Restarts" (this session) | "Skipped" count |
| Stat 4 | "Time" m:ss | same | same | same | whole session incl. study time | same |
| Banner | "New Score Record!" / "New Time Record!" / "New Accuracy Record!" / "Two New Records!" / "Triple Record Broken!" (L5781–5785). Score/accuracy never on a level's first play; a first-ever clean sweep always counts as a time record (L6320) | never | as standard (key `daily-five\|Daily\|diff`) | never | never | "New Best Score!" when there was an earlier game at this region/difficulty and this beats it (L6550, L6571–6576) |
| Bests panel | "— Your Personal Bests —": Best Score `v/max` · Best Accuracy `pct% · c/t` · Fastest Clean Sweep `m:ss` (if any) · Games Played; broken ones get `.broken` + ★ | hidden | as standard | hidden | hidden | "— Your Progress —": Best Game · (2+ games) "Avg, Last N" with `span.pin-trend.up` "↑" / `.down` "↓" · "Avg Miss, Last N" · Games Played (L6583–6597) |
| Revisit panel | if any missed or second-try: "— {noun} to revisit —" (noun from `targetNoun` L4526–4530: Countries / States / Cities / Provinces & Territories / Provinces & Regions / Regions); `span.missed-item` (missed, sienna dot) then `span.missed-item.second-try` (gold dot), separated by `<span style="opacity:0.3">·</span>`; legend `span.missed-key` "Missed", `span.missed-key.second-try` "Second try" — only the kinds present (L5702–5719) | same | same | same | hidden | "— Farthest off —": up to 6 cities scoring < 80, farthest first, "City · 1,240 km" / "City · skipped"; legend slot holds `span.pin-weak` "Hardest over your last few tries: City (avg 800 km), City (skipped)" (L6600–6616) |
| Share | shown | **hidden** | shown | **hidden** | hidden | shown |
| Practice These | shown if anything to revisit: "Practice These N" / "Practice This One" | same | hidden | hidden | hidden | hidden |
| Replay | "Study Again"; `.primary` only when Practice isn't offered (L5745–5748) | text "Full Game" | **hidden** | **hidden** | "Learn Again", primary | "Play Again", primary |
| Practice Replay | hidden | hidden | shown | shown | hidden | hidden |
| View Map | shown unless Hard/Uncharted | same | same | same | hidden | hidden |
| Choose Region | always | always | always | always | always | always |

**[run]** confirmed for standard (Oceania), daily and Pin: button visibility and texts match the table.

Side effects at the same moment: records commit and focus-list save (standard, real daily — not practice), daily attempt save (real daily), Pin store save, `syncAfterGameEnd()` (L5677, L6548), learn progress cleared (Learn).

### 5.3 Share text (what "Share" produces)

- Standard — `buildShareText()` L7383–7464: line 1 "🧭 Cartographer's Atlas · Nov 16, 2026"; line 2 "{Region}{ · Hard | · Uncharted} · S/Max pts · c/t found · m:ss" or "… · Perfect! S/Max pts in m:ss ✨"; blank; emoji rows of 10 (🟩 / 🟨 / 🟥); blank; optional "🏆 New Score Record · New Accuracy Record · New Time Record"; level link. Region wording here differs from the on-screen label: "US States", "US Capitals → States", "US States → Capitals", "The World", continent name, province round label, and for cities just "Northeast".
- Daily — `buildDailyShareText()` L7475–7495: "🧭 Atlas Daily #205{badge}" / "4/5 found · 7/10 pts" or "Perfect! 10/10 pts ✨" / blank / five squares / blank / `…?play=daily`. No country names (spoiler-free). Also reachable from the played Daily card.
- Pin — `buildPinShareText()` L6644–6662: header line; "Pin the City · {Region}{badge} · 1,640/2,000 pts · avg 212 km off"; rows of 10 squares (🟩 ≥ 80, 🟨 ≥ 50, 🟧 ≥ 20, 🟥 below); level link.
- Share-sheet titles: "Cartographer's Atlas" (L7546), "Atlas Daily" (L7511).

---

## 6. Game HUD

### 6.1 Header

- `#back-btn` "← Atlas" → menu immediately; the round is abandoned with nothing saved and no confirmation (L7598). Escape does the same (L7668–7669).
- `#review-back-btn` "← Results" — review mode only (L7619–7622).
- `#region-tag` (L4719–4727): `GAME_MODES[mode].label(region)`; daily → "Daily #N" (+ " (Practice)"); + " · Practice" for a focus round; + " · Learn". Never shows difficulty. `display: none` at ≤ 720 px (L2437), so phones show no level name in play.

Stat labels and values by round type (`setLearnChrome` L6842–6844, `updateStats` L5558–5589):

| Slot (ids) | Standard | Learn | Pin |
|------------|----------|-------|-----|
| 1 `#stat-score-label` / `#stat-score` (larger) | "Score" — points (2 / 1 / 0 per item) | "Level" — current level | "Score" — points (0–100 per city) |
| 2 `#stat-correct-label` / `#stat-correct` (moss) | "Found" | "Found" — this pass | "Avg km" — bare number or "—" |
| 3 `#stat-wrong-label` / `#stat-wrong` (sienna) | "Missed" | "Restarts" | "Last km" — number, "skip" or "—" |
| 4 (static label) / `#stat-remaining` | "Left" — questions unanswered | "Left" — provinces not yet introduced | "Left" — cities remaining |

`#stat-score` gets `.score-flash` whenever points are earned (also flashes the Level number in Learn). No timer, no progress bar, no question counter ("7 of 23").

Measured chrome **[run]**: 1280×720 → header 67 px + prompt 101 + controls 67, leaving the map 485 px of 720; 390×844 → 53 + 75 + 56, map 660 px.

### 6.2 Prompt panel variants (`nextCountry` L5032–5104, `startLearnLevel` L6863–6899)

| Round | `.prompt-label` | `#prompt-country` | Extras |
|-------|-----------------|-------------------|--------|
| World, continent, daily, US states, province | "Find on the map" | the name | — |
| Capitals → States | "Click the state with this capital" | the capital | — |
| States → Capitals | "Which capital belongs to" | the state | `#choices-panel` shown: four `button.choice-btn[data-capital]` in a 2-column grid (`renderCapitalChoices` L5120–5137); the state is tinted on the map (`.prompt-highlight`) and panned into view. Map clicks are ignored |
| US cities | "Find the city" | "City, State" | targets are `circle.city-dot`, not polygons |
| Pin the City | "Pin the city" | city name + `<span class="pin-prompt-country">Country</span>` on its own line (0.42 em italic) | tap sets the pin; scoring happens on Drop Pin |
| Learn — study | "Level n of N · study it" (n = 1) / "Level n of N · study all n" (L7029–7032) | the newest province | map shows `.learn-known` / `.learn-new` tints and name labels |
| Learn — quiz | "Level n of N · find" (L5089–5091) | the name | one miss or skip restarts the level |

Choice button states: default → `.choice-wrong` (+ `disabled`) → `.choice-correct` or `.choice-reveal` (pulsing gold on the right answer after two misses or a skip).
New prompt → `.pulse`; wrong answer → `.shake`.

### 6.3 Controls and when each shows

| Control | Shows | Notes |
|---------|-------|-------|
| `#skip-btn` "Skip" + `span.ctrl-kbd` "S" | always, except Learn study (L6890) and review mode | counts as a miss and reveals the answer; in Pin it scores the city 0 and reveals it; disabled after a Pin reveal (L6486), re-enabled on the next prompt (L5103). Key hint hidden ≤ 720 px |
| `#learn-ready-btn` "Quiz Me" | Learn study only (L6891, hidden again L7140) | Enter |
| `#pin-btn` | Pin only (L6846) | "Drop Pin" disabled until a spot is tapped → after the reveal "Next", or "Finish" on the last city (L6487). Enter |
| `#zoom-in-btn`, `#zoom-out-btn`, `#zoom-reset-btn` | always (top-right of the map) | ×1.6, ÷1.6, reset; zoom range 1–60× (L4858); double-click zoom disabled (L4861) |
| `#map-style-btn` | always except Uncharted | `.is-active` + `aria-pressed` when satellite is on; `title` flips between "Satellite view (M)" and "Parchment view (M)" |

### 6.4 Keyboard (L7643–7671; active only on the game screen and not while typing in an input)

| Key | Action |
|-----|--------|
| Enter | Learn study → start the quiz; Pin → Drop Pin / Next / Finish |
| S | Skip |
| + or = | Zoom in |
| - or _ | Zoom out |
| 0 | Reset view |
| M | Parchment ⇄ satellite (ignored in Uncharted) |
| Escape | Back to the menu (abandons the round) |

Elsewhere: Escape closes either modal (L7297–7299, L8209–8213). Nothing else is bound; the map itself cannot be operated from the keyboard.

### 6.5 Feedback timings

Correct → green flash, next prompt after 900 ms (1,100 ms for capital choices) · first wrong → red flash 700 ms + toast · second wrong / skip → gold reveal + pulsing marker, next prompt after 2,600 ms (1,800 ms when there is no shape to show) · toast 1,400 ms · Pin waits for the button · screen cross-fade 600 ms · map drawn 80 ms after the switch (L4735).

---

## 7. User-facing strings that carry the brand voice

Voice in one line: a nineteenth-century atlas — "study", "expedition", "findings", "grand tour", "unfurl"; centred headings wrapped in em-dashes; lower-case italic sub-lines; roman numerals and "№"; " · " as the separator; "→" between paired things.

**Identity** — `<title>` "Cartographer's Atlas — Learn the World" (L6) · description "A study in the nations of the known world. Find every country on the map, by continent or across the globe." (L9, L19, L29) · image alt "Cartographer's Atlas — an elegant compass rose on parchment" (L23, L31) · "Est. MMXXVI · Volume I" (L2491) · "Cartographer's *Atlas*" (L2495) · "— a study in the nations of the known world —" (L2496) · share header "🧭 Cartographer's Atlas" (L7451, L6653), "🧭 Atlas Daily #N" (L7488).

**Menu** — "Choose Your Study" (L4010) · "Unfurling the world map" (L3996) · "The map could not be unfurled." / "The atlas data failed to load. This may be a network issue — please check your connection and refresh the page." (L3812–3813) · "The Daily Five", "five countries · today's puzzle for the world", "Play Today's Puzzle →", "Today's puzzle complete", "Next puzzle in", "🔥 N day streak" (L4034–4059) · "The Whole World", "every continent, every nation", "Begin Grand Tour →" (L4069–4075) · folder lines (§2.1) · sub-view subtitles "Six regions of the known world" (L4177), "A closer study of the fifty states" (L4220), "Four regions of the United States" (L4265), "The inner divisions of great nations" (L4314), "A blank map, a city name, and a pin" (L4336), "Eleven time zones in three rounds" (L4371) · continent epithets (L3904–3911) · province sub-lines (L3258–3278) · "coming soon" (L4256–4262) · "← Back" (L4389).

**Difficulty and map** — "Normal / Hard / Uncharted" and their descriptions (L4399–4401, L4338–4340) · "Satellite Map", "Real imagery under the borders", "Always on in Uncharted" (L4429–4431).

**In play** — prompt labels (§6.2) · "Skip", "Quiz Me", "Drop Pin", "Next", "Finish" · "← Atlas", "← Results" · "Scroll to zoom · drag to pan" (L2565) · "Zoom in to see every name" (L2567) · "Imagery © Esri, Maxar, Earthstar Geographics" (L2566, L5861 — required credit) · "Loading imagery… · " (L5939) · "Loading the United States" (L4574), "Loading {Country}" (L4591).

**Toasts** — "Well done — *X* · +2 pts" / "· +1 pt" (L5250, L5403); Learn "Well done — *X*" (L5251) · "*Clicked* — try again" (L5289, L5429); "Not quite — try again" (L5203) · "Not quite — this is *X*" (L5281, L5440, L5447); Learn "That's *Clicked* — this is *X*" (L5283–5284) · capitals "*Capital* → State · +2 pts" (L5249), "*State* → Capital · +2 pts" (L5153), reveals without points (L5197, L5280, L5545, L5547) · skip "*X* — shown on the map" (L5549) · Pin "Bullseye — *City* · +100" (L6478), "*City* · 412 km off · +57" (L6479), "*City* — here it is" (L6477) · Learn "Level cleared — adding *X*" (L7157), "Back to the start of level N" (L7163) · "Satellite imagery couldn't load — showing the parchment map" (L6236).

**Results** — "Expedition Complete" (L2583) · "Your *Findings*" (L2586) · "% accuracy", "learned", "of N points" · "— Your Personal Bests —" (L2616, L6859), "— Your Progress —" (L6583) · "Best Score", "Best Accuracy", "Fastest Clean Sweep", "Games Played" (L5806–5826); "Best Game", "Avg, Last N", "Avg Miss, Last N" (L6585–6590) · record headlines (L5781–5785), "New Best Score!" (L6574) · "— {noun} to revisit —" (L5707), "— Farthest off —" (L6604), "Hardest over your last few tries:" (L6610), "Missed", "Second try" (L5713–5714) · "Share Results", "Practice These N", "Practice This One", "Study Again", "Full Game", "Play Again", "Learn Again", "Practice Replay", "View Map", "Choose Region" · "✓ Copied to clipboard" (L7531, L7564).

**Chooser** — "Fresh Game" / "All N {noun} · counts toward your records" (L7243) · "Focus on Those N" / "Focus on That One" (L7235) / "Just the ones you missed or found on a second try · practice only, your records stay as they are" (L2665) · "Learn Them" / "Keep Learning" (L7252, L7256) / "Start with one, add one each level. A miss restarts the level · practice only" (L7250) / "Pick up at level n of N · …" (L7254) · "Start learning over from one" (L2671) · "Your last full game here (date) left N to revisit." (L7233) · "How would you like to play?" (L7238).

**Sync** (plainer, more technical voice) — "Set up sync" / "Sync" (L7969) · "Cross-Device Sync", "Mirror your records across browsers, phones, and computers." (L2641–2642) · tabs "New sync key", "Import existing" · help texts (L8023, L8031, L8069) · "Username (optional)", placeholder "Cartographer" · "Create Sync Key", "Connect & Pull Records", "Sync Now", "Disconnect this Device", "Show"/"Hide", "Copy"/"✓ Copied" · status lines (L8047–8049, L8105, L8116, L8177, L8181) · confirm text (L8193).

**Native dialog copy** — the two load-failure alerts (L4579, L4596), "Copy your results:" (L7539, L7573), "Copy this sync key:" (L8164).

Glyphs used as icons (text, not images): ✦ ⌖ ★ ⌾ ❖ › ▸ ⛓ ❧ № ← → ✓ and emoji 🔥 🧭 🏆 ✨ 🟩 🟨 🟧 🟥 ⬜. Several of the symbol glyphs depend on system fonts.

Inconsistencies to settle in the rewrite: "Hard Mode" vs "Hard" (D12); curly apostrophes in some strings and straight ones in others; "Choose Region" is used for every mode; "Share Results" vs "Share Result"; the on-screen level name and the shared level name differ for US modes, World and cities (§5.3).

---

## 8. CSS architecture and the contracts the JS depends on

One `<style>` block, L38–2479, no layers, no nesting; sections in source order: tokens L39–59 · reset/body/grain/vignette L61–101 · `#app`, `.screen` L103–125 · menu L127–577 · game header, stats, prompt L579–724 · map + SVG states L726–954 · zoom controls and hint L956–1032 · satellite L1034–1151 · review mode L1153–1172 · controls, buttons L1174–1246 · toast L1248–1282 · results L1284–1546 · chooser buttons L1548–1586 · results actions L1588–1594 · shared keyframes L1596–1605 · capital choices L1607–1675 · Learn L1677–1742 · Pin L1744–1818 · US backdrop + unused L1820–1840 · sub-menu header L1842–1910 · Daily card L1912–2063 · folder/US/province/disabled cards L2065–2129 · loading overlay L2131–2164 · sync entry L2166–2204 · sync modal L2206–2425 · the one media query L2427–2478.

### 8.1 Tokens (`:root`, L39–59)

| Token | Value | `var()` uses |
|-------|-------|------|
| `--parchment` | `#f1e7d2` | 25 |
| `--parchment-deep` | `#e8dcc0` | 0 |
| `--parchment-shadow` | `#d9c9a5` | 0 |
| `--ink` | `#1f2a3a` | 62 |
| `--ink-soft` | `#3a4a60` | 3 |
| `--ink-faded` | `#6b6250` | 25 |
| `--sepia` | `#6b4423` | 41 |
| `--sepia-soft` | `#8a6239` | 0 |
| `--ocean` | `#a7c0c9` | 0 |
| `--ocean-deep` | `#7a9ba6` | 1 |
| `--land` | `#f5ebd4` | 3 |
| `--land-border` | `#b29e72` | 11 |
| `--gold` | `#c8953c` | 23 |
| `--gold-bright` | `#e0a84a` | 34 |
| `--sienna` | `#a0311e` | 15 |
| `--sienna-deep` | `#7d2515` | 5 |
| `--moss` | `#4a6b3c` | 16 |
| `--moss-bright` | `#5f8a4b` | 12 |
| `--highlight-glow` | `rgba(200,149,60,0.6)` | 0 |

Colour tokens only — no spacing, radius, shadow, type-scale, duration or z-index tokens. Radii are 1–2 px literals throughout (plus 50 % circles and the 11 px switch).

Hard-coded colours that bypass the tokens:
- Hex: `#6f9c59` (L838, L890) · `#9ec97f` (L910, L925) · `#a84a3a` (L2371, L2372, L2384) · `#b23d28` (L848, L900) · `#b6dd98` (L1078, L1124) · `#b85a5a` (L2203) · `#c94f3c` (L915, L931) · `#d0dcc4` (L1672) · `#d47d6a` (L1282) · `#d6f0c0` (L1096, L1129) · `#dde8ed` (L950, L1822 — the ocean actually drawn) · `#ead39a` (L1681, L1710, L1720) · `#ede3cc` (L762, L1751) · `#f0a08c` (L1085, L1125) · `#f0dfb0` (L758) · `#fff` (L1237, L1640, L1647, L2046).
- 106 `rgba()` literals; the common bases are a card cream `rgba(255,250,235,…)` ×20 (no token), gold `rgba(200,149,60,…)` ×19, parchment `rgba(241,231,210,…)` ×15, ink `rgba(31,42,58,…)` ×11, sepia `rgba(107,68,35,…)` ×8, black ×5, `rgba(248,238,214,…)` ×4.
- Inline SVG fills in the compass (L2499–2506) and `<meta name="theme-color" content="#f1e7d2">` (L34) — both need handling for a dark theme.
- Page background: three radial gradients on `body` (L73–76), an SVG-turbulence grain layer with `mix-blend-mode: multiply` (`body::before`, L81–91) and a vignette (`body::after`, L94–101), both fixed and full-viewport.

No `prefers-color-scheme`, no `prefers-reduced-motion`, no `:focus-visible`, no `@supports`, no container queries, no `hover`/`pointer` queries.

### 8.2 Breakpoints

Exactly one: **`@media (max-width: 720px)` at L2428** (to L2478). It changes:
`.game-header` padding, wraps, gap (L2429–2433) · `.hdr-left/.hdr-right` gaps (L2434–2436, L2445) · `.region-tag` hidden (L2437) · `.prompt-panel` padding (L2438) · `.controls` padding/gap (L2439) · `.ctrl-btn` 12 px (L2440) · `.ctrl-kbd` hidden (L2441) · stat sizes 16/20 px, labels 9 px (L2442–2444) · `.results-stats` 2 columns (L2446) · `.r-stat-value` (L2447) · record banner sizes (L2448–2450) · `.bests-grid` 2 columns (L2451–2452) · capital choices (L2453–2454) · sub-menu header/back link (L2456–2459) · folder card sizes (L2460–2462) · Daily card sizes, actions stacked full-width (L2463–2468) · `.view-sub` header scale 0.5 (L2469) · `.regions` fixed 2 columns (L2470) · featured card stacked and centred (L2471–2477).

Everything else is fluid: `clamp()` type at L168, L185, L696, L1300, L1330; `.regions` `repeat(auto-fit, minmax(220px, 1fr))` max 980 px (L379–385); `.bests-grid` auto-fit 140 px (L1447); `.menu-inner` max 1100 px (L136), `.results-inner` max 760 px (L1293); `100dvh` (L65, L108) with `100vh` fallback (L107); safe-area insets on the game header and controls only (L586, L1177, L2430, L2439); modal `min(460px, 100vw − 40px)` and `max-height: calc(100vh − 60px)` (L2225–2226). No landscape or short-viewport rules; `html, body { overflow: hidden }` (L63–67) — each screen scrolls itself.

### 8.3 z-index layers

| z | What | Line |
|---|------|------|
| 1 | `body::before` grain (fixed) | L86 |
| 2 | `body::after` vignette (fixed) | L99 |
| 3 | `#app` (creates the stacking context for everything below except the loading overlay) | L105 |
| 0 | `.sat-canvas` (inside `.map-wrap`) | L1051 |
| 1 | `#world-map` when `.sat-on` | L1056 |
| 2 | `.sat-credit` | L1136 |
| 4 | `.prompt-panel` | L681 |
| 5 | `.game-header` | L594 |
| 11 | `.zoom-controls` | L964 |
| 20 | `.toast` | L1264 |
| 100 | `.sync-modal-overlay` (both modals) | L2212 |
| 100 | `.loading-overlay` (child of `<body>`, so above `#app` entirely) | L2139 |

`.zoom-hint` has no z-index (paints above the SVG by source order).

### 8.4 Keyframes and motion

| Keyframes | Line | Used by |
|-----------|------|---------|
| `dots` | L561 | `.loading-state::after` L558, `.loading-dots::after` L2163 (infinite) |
| `scoreFlash` | L670 | `.stat-value.score-flash` L667 |
| `pulsePrompt` | L713 | `.prompt-country.pulse` L710 |
| `shake` | L718 | `.prompt-country.shake` L706 |
| `revealPulse` | L825 | `.reveal-marker .pulse-ring` L810 (infinite; animates SVG `r`) |
| `dotFlashCorrect` / `dotFlashWrong` / `dotPulseReveal` | L909 / L914 / L919 | `.city-dot` states L874, L880, L906 (last is infinite) |
| `flashCorrect` / `flashWrong` / `flashReveal` | L924 / L930 / L935 | `.country.target-correct` L785, `.target-wrong` L792, `.reveal` L801 (infinite) |
| `hintFade` | L1028 | `.zoom-hint` L1025 (5 s, ends invisible) |
| `recordFadeIn` | L1421 | `.new-record-banner` L1399 |
| `brokenGlow` | L1465 | `.best-item.broken` L1462 (infinite) |
| `fadeUp` | L1597 | `.brand` L148, `.title` L174, `.subtitle` L192, `.compass` L200, `.section-label` L210, `.mode-toggle-row` L239, `.region-card` L398 (+ nth-child delays L403–409), `.submenu-header` L1866, `.sync-entry-row` L2172 |
| `spinSlow` | L1602 | `.compass` L200 (60 s, infinite) |
| `choicePop` / `choiceReveal` | L1659 / L1665 | `.choice-correct` L1641, `.choice-reveal` L1656 (infinite) |
| `syncFadeIn` | L2219 | `.sync-modal-overlay` L2216 |

Transitions worth knowing: `.screen` opacity 0.6 s (L119); `.region-card` all 0.35 s with lift on hover (L393, L421–426); `.country` fill 0.2 s on every path (L753); `.toast` all 0.4 s (L1263); `.loading-overlay` opacity 0.3 s (L2142); `.menu-header` all 0.4 s (L1849, L1854). Costly paint effects: `filter: drop-shadow` ×2 on `.country.reveal` (L799–800), the full-screen blend-mode grain (L90), `vector-effect: non-scaling-stroke` on every country path (L752).

### 8.5 Fonts

Loaded (L37, Google Fonts, `display=swap`): Cormorant Garamond roman 400/500/600/700 + italic 400 · Crimson Pro roman 300/400/500/600 · JetBrains Mono 400/500. Body default is Crimson Pro (L70).

Actually used (family · weight · style → selectors):
- **Cormorant** 400 roman → `.section-label span`, `.back-btn`, `.ctrl-btn`, `.toast`, `.back-link`, `.folder-icon`, `.folder-arrow`, `.sync-modal-close`
- **Cormorant** 500 roman → `.title`, `.r-name`, `.stat-value`, `.prompt-country`, `.zoom-btn`, `.results-title`, `.grade-big`, `.r-stat-value`, `.best-value`, `.focus-choice-title`, `.choice-btn`, `.submenu-title`, `.sync-modal-title`
- **Cormorant** 600 roman → `.stat-primary .stat-value`, `.ctrl-btn.share`, `.learn-label text` · 700 roman → `.pin-truth-label`, `.learn-label.new text`
- **Cormorant** 400 italic → `.brand-mark`, `.title em`, `.featured-cta`, `.loading-state`, `.region-tag`, `.prompt-label`, `.grade-unit`, `.bests-heading`, `.missed-heading`, `.daily-cta`, `.daily-done-msg`, `.loading-inner`, `.sync-label`, `.sync-btn`, `.sync-tab`, `.toast em`, `.results-title em`, `.pin-prompt-country`
- **Cormorant** 500 italic (not loaded) → `.switch-title`, `.difficulty-seg`, `.featured-mark`, `.record-text` · 600 italic (not loaded) → `.daily-badge`
- **Crimson Pro** 400 roman → body, `.switch-desc`, `.error-state`, `.stat-label`, `.sat-credit`, `.r-stat-label`, `.best-label`, `.missed-item`, `.missed-key`, `.focus-choice-desc`, `.daily-streak`, `.daily-result-stats`, `.sync-entry-btn`, `.sync-modal-subtitle`, `.sync-input.text`, `.sync-mini-btn`, `.sync-status-line`, `.sync-help`
- **Crimson Pro** italic (none loaded) → 400: `.r-subname`, `.r-best`, `.zoom-hint`, `.results-region`, `.focus-reset-link`, `.pin-scoring-note`, `.pin-weak`, `.submenu-subtitle`, `.daily-next` · 300: `.subtitle`
- **JetBrains Mono** 400 → `.r-count`, `.ctrl-kbd`, `[data-countdown]`, `.sync-input`, `.sync-key-display` · italic (not loaded) → `.region-card.disabled .r-count` ("coming soon")
- The compass "N" asks for `font-family="Cormorant Garamond"` inline (L2506).

Type conventions: uppercase + wide tracking (0.1–0.4 em) for labels and buttons; sizes are px literals from 9 to 128; rules at ≤ 12 px are at L215, L319, L491, L507, L521, L642, L687, L1016, L1139, L1242, L1372, L1489, L1542, L1839, L2053, L2312, L2338, L2378, L2420, L2440, L2444, L2459.

### 8.6 Contract: classes, ids and attributes the JS reads or writes by name

A restyle may rename nothing in this section without changing the script too.

**Screen / page level**

| Selector | Written at | Meaning |
|----------|-----------|---------|
| `.screen` / `.screen.active`; ids `menu-screen`, `game-screen`, `results-screen` | L7589–7591 | which screen shows (`name + '-screen'`) |
| `#menu-screen.view-sub` | L4444 | a sub-view is showing |
| `#game-screen.review-mode` | L4541, L7616, L7620 | post-game map review |
| `#game-screen.pin-mode`, `.pin-hard` | L6849, L6851 | Pin the City chrome; Pin + Hard hides borders |
| `#map-wrap.sat-on`, `.no-borders` | L5886–5887 | satellite showing; Uncharted |
| `#loading-overlay.loading-overlay.visible` | L4752–4761 | created by JS with exactly this id and class |
| `.sync-modal-overlay.show` on `#sync-modal-overlay` / `#focus-modal-overlay` | L7996, L8001, L7283, L7287; read L7298, L8210 | modal open |

**Menu** (all created as HTML strings, so class names live in the JS)

| Selector | Where | Meaning |
|----------|-------|---------|
| `[data-action="play"][data-region]`, `[data-action="open-folder"][data-folder]`, `[data-action="back-to"][data-target]`, `[data-action="share-daily"]`, `[data-action="replay-daily"]` | queried L4446–4473 | all menu interaction |
| `.difficulty-seg[data-difficulty]` (+ `.active`, `aria-pressed`) | built L4412–4414, queried L7360 | difficulty picker |
| `#satellite-toggle` (checkbox; `checked`, `disabled`), `.mode-toggle.is-locked` | L4422–4424, L7368 | satellite switch |
| `#sync-entry-btn` + state class `never` / `ok` / `error` | L7968–7972, L7982 | sync entry |
| `[data-countdown]` | L4047, L4144 | daily countdown target; its absence stops the timer |
| `.daily-share-btn` | L4044, queried L7528 | gets "✓ Copied" + `.copied` |
| `.region-card.disabled` + `disabled` attr | L4281 | coming-soon cards |
| `.daily-card.daily-fresh` / `.daily-done` | L4052, L4032 | Daily card state (CSS only) |

**Game HUD**

| Selector | Written at | Meaning |
|----------|-----------|---------|
| `.prompt-panel .prompt-label` (class path, no id) | L5045, L6880 | prompt label text |
| `#prompt-country.pulse` / `.shake` | L5097–5100, L5176–5178, L5269–5271, L5418–5420, L6886–6888 | prompt animations (class removed, reflow forced, re-added) |
| `#choices-panel` `style.display` `''`/`'none'`; children `button.choice-btn[data-capital]` + `.choice-correct` / `.choice-wrong` / `.choice-reveal` | L5054–5094, L5131–5133, L5151, L5172, L5190, L5527 | capital choices |
| `#stat-score.score-flash` | L5594–5596 | points flash |
| `#toast` — `className = 'toast ' + kind`, then `.show` | L5601–5605 | toast; kind is `correct` or `wrong` |
| `#skip-btn`, `#learn-ready-btn`, `#pin-btn` — `style.display`, `disabled`, `textContent` | L5103, L6461–6462, L6486, L6626, L6845–6847, L6890–6891, L7140–7141 | which control shows |
| `#zoom-hint`, `#learn-hint` — `style.display` | L4730, L7025–7026 | hints |
| `#map-style-btn.is-active`, `aria-pressed`, `title` | L5889–5891 | satellite button state |
| `#sat-credit` text; `#sat-canvas` size, pixels and `style.transform` | L5939; L5907–5908, L5926–5929, L6133–6134 | imagery layer |
| `#region-tag`, `#stat-score-label`, `#stat-correct-label`, `#stat-wrong-label`, `#stat-score`, `#stat-correct`, `#stat-wrong`, `#stat-remaining` — `textContent` | L4727, L6842–6844, L5564–5588 | header text |

**Results**

| Selector | Written at |
|----------|-----------|
| `#results-region`, `#grade-big`, `#grade-unit`, `#r-score`, `#r-correct`, `#r-wrong`, `#r-time`, `#r-score-label`, `#r-correct-label`, `#r-wrong-label`, `#bests-heading`, `#missed-heading` — `textContent` | L5688–5693, L5707, L6556–6566, L6583, L6604, L6855–6859, L7179–7185 |
| `#new-record-banner` — innerHTML (`.record-laurel`, `.record-text`, `.record-laurel.flipped`), `style.display` `'flex'`/`'none'` | L5777–5791, L6572–6578 |
| `#bests-section` — `style.display` `'block'`/`'none'`; its `.bests-grid` innerHTML (`.best-item[.broken]`, `.best-value`, `.best-star`, `.best-label`, `.pin-trend.up/.down`) | L5799, L5831–5839, L6591–6597 |
| `#missed-section` — `style.display` `'block'`/`'none'`; `#missed-list` (`.missed-item[.second-try]`, inline-styled separators); `#missed-legend` (`.missed-key[.second-try]`, `.pin-weak`) | L5708–5718, L6605–6615, L7189 |
| `#share-btn`, `#practice-btn`, `#replay-btn`, `#daily-practice-btn`, `#view-map-btn` — `style.display`, `textContent`; `#replay-btn.primary` toggled; `#share-btn.copied` | L5727–5760, L6618–6625, L7190–7197, L7565–7568 |
| `#home-btn`, `#back-btn`, `#review-back-btn` — click targets only | L7598–7599, L7619 |

Because the JS writes inline `display` values, `#bests-section` and `#missed-section` are forced to `block` and the banner to `flex` when shown, whatever the stylesheet says; buttons use `''` and fall back to the stylesheet.

**Modals**

| Selector | Written at |
|----------|-----------|
| `#focus-modal-title`, `#focus-modal-subtitle`, `#focus-choice-fresh-desc`, `#focus-choice-focus-title`, `#focus-choice-learn-title`, `#focus-choice-learn-desc` — text | L7225–7257 |
| `#focus-choice-fresh`, `#focus-choice-focus`, `#focus-choice-learn`, `#focus-learn-reset` — `.onclick`, `style.display`; `#focus-modal-close` | L7236–7282, L7293 |
| `#sync-modal-body` innerHTML; `#sync-modal-close` | L8005–8012, L8204 |
| `[data-sync-tab]` + `.active`; `[data-sync-pane]` `style.display` | L8074–8082 |
| `#sync-username-new`, `#sync-create-btn`, `#sync-key-input`, `#sync-import-btn`, `#sync-import-status`, `#sync-username-edit`, `#sync-key-display` (+ `.hidden`), `#sync-key-show`, `#sync-key-copy`, `#sync-now-btn`, `#sync-status-line`, `#sync-disconnect-btn` | L8085–8198 |
| `.sync-status-line` + `error` / `success` (whole `className` replaced) | L8106, L8112, L8117, L8178, L8182 |

### 8.7 Contract: the SVG map layer (replaced by the globe, but these are today's state names)

Built in `renderMap()` L4773–4996 inside `svg#world-map > g`:

| Element | Class / attributes | State classes toggled (where) |
|---------|--------------------|-------------------------------|
| Backdrop | `path.sphere-bg`, `path.graticule` (world) or `rect.us-ocean` (US, provinces); `path.inset-frame` (US, visible on satellite only) | — |
| Small-target hit areas | `path.country-hitzone[data-fkey]` (22 px invisible stroke under small features) | — |
| Every feature | `path.country.eligible` or `.ineligible`, `[data-fkey]` | `.target-correct` (0.7–0.9 s), `.target-wrong` (0.7 s), `.reveal` (2.6 s), `.completed-correct`, `.completed-wrong` (persist unless Hard/Uncharted), `.prompt-highlight` (States → Capitals), `.learn-known`, `.learn-new` — L5110–5114, L5162–5165, L5245–5266, L5300–5315, L6875–6877, L6910–6911, L7117–7118 |
| City targets (US cities) | `circle.city-dot[data-city]` | `.target-correct`, `.target-wrong`, `.reveal`, `.completed-correct`, `.completed-wrong` — L5401–5415, L5446–5455 |
| Reveal marker | `g.reveal-marker` > `circle.pulse-ring`, `circle.pulse-ring.delayed`, `circle.center-dot` | appended/removed L5360–5375, L5494–5505 |
| Pin layer | `g.pin-layer` > `path.pin-line`, `g.pin-scaled.pin-truth[data-x][data-y]` (`circle.pin-truth-ring`, `circle.pin-truth-dot`, `text.pin-truth-label`), `g.pin-scaled.pin-guess[data-x][data-y]` (`path`, `circle`) | rebuilt by `drawPinLayer()` L6494–6524; rescaled L6527–6532 |
| Learn labels | `g.learn-labels` > `g.learn-label[.new][data-cx][data-cy]` > `text` (+ `circle.learn-dot`) | `placeLearnLabels()` L6923–7020; rescaled L7124–7132 |

**The DOM is the only record of what is marked on the map.** The resize handler (L7682–7743) reads `.completed-correct`, `.completed-wrong`, `.prompt-highlight` and the city-dot classes back out of the SVG to re-apply them after a rebuild, and review mode works only because the SVG is left untouched. `state` holds `missed`, `secondTry` and `sequence` but no per-feature map. A canvas/WebGL globe needs that state kept in JS.

Satellite-mode restyling of all of the above lives in L1054–1129 and L1706–1721, L1798–1799 (`.map-wrap.sat-on …`, `.map-wrap.no-borders …`); Pin-mode restyling in L1745–1754.

---

## 9. Accessibility facts

**Present**
- `<html lang="en">` (L2); viewport does not block pinch-zoom (L5).
- Both modals: `role="dialog" aria-modal="true" aria-labelledby` (L2638, L2650); close buttons `aria-label="Close"` (L2643, L2655); Escape and scrim-click close; closed modals are `display: none`, so their contents are out of the tab order.
- Difficulty picker: `role="group" aria-label="Difficulty"` (L4418), `aria-pressed` on each segment (L4413).
- Zoom buttons: `aria-label` (L2552–2561); the style button also `aria-pressed`, kept in sync (L5890).
- `#sat-canvas` is `aria-hidden` (L2549).
- Sync inputs have `<label for>` (L8025, L8033, L8052).
- All menu cards, controls and choices are real `<button>`s.

**Missing or wrong**
- **Hidden screens stay live.** Inactive screens are only `opacity: 0; pointer-events: none` (L117–118), so their buttons are still tabbable and exposed to screen readers — 9 focusable buttons from the game and results screens while the menu is showing **[run]**. No `inert`, `hidden` or `aria-hidden` anywhere.
- **No focus management in modals.** Opening either modal leaves focus on the card/button behind it (**[run]**: active element was the trigger); no focus trap; no restore on close. Same for screen changes: focus stays on a now-invisible button and nothing announces the new screen.
- **No live regions.** Toasts (the only right/wrong feedback), the changing prompt, score, countdown, sync status and "Copied" states are silent to assistive tech.
- **The map is pointer-only.** Country paths and city dots have click handlers but no role, name or tabindex; the only fully keyboard-playable mode is States → Capitals (its choices are buttons). Keyboard users can otherwise only Skip, zoom, and for Pin cannot place a pin at all.
- **No visible-focus styling**: no `:focus-visible` rules; the satellite checkbox is visually zero-size (L261–267) so focusing it shows nothing; `.sync-input:focus { outline: none }` (L2304–2305) swaps the outline for a gold border (2.2:1 against parchment).
- Structure: no `<main>`/`<nav>`; one `<header>` (game); two `<h1>` always in the DOM (L2495, L2586); sub-view titles, card names and section headings are `<div>`s. The played Daily card is a `<div>` containing buttons; every card button contains block `<div>`s.
- Decorative glyphs and emoji (⛓ ⌖ ★ ⌾ ❖ ✦ › ❧ 🔥) are in the text flow with no `aria-hidden`; the compass SVG and map SVG have no role or label; arrows in names read as "right arrow".
- Native `title` tooltips on the zoom buttons (D15). Native `alert` / `confirm` / `prompt` for errors, disconnect and clipboard fallback.
- No reduced-motion handling; seven infinite animations (compass, reveal flash, reveal rings, city-dot reveal, broken-record glow, choice reveal, loading dots), the prompt shake, and the menu re-animation (D9).
- Timed feedback cannot be paused or re-read: toast 1.4 s, answer reveal 2.6 s then auto-advance.
- Abandoning a game (← Atlas or Escape) is immediate and silent.

**Colour-only signals**: found vs missed fills (moss green vs sienna red) and their toasts' border colours; missed vs second-try dots (sienna vs gold); sync status dot (green vs red); the 🟩🟨🟥 result grids. None has a second cue (icon, pattern or text) on the map itself.

**Contrast** (computed, WCAG ratio; small text needs 4.5, large text and UI graphics 3.0)

| Pair | Ratio | Where |
|------|-------|-------|
| ink on parchment | 11.8 | body text, titles |
| sepia on parchment | 6.9 | brand mark, section label, prompt label, count lines |
| ink-faded on parchment | 4.9 | subtitles, stat labels, descriptions, sync help — clears 4.5 only just, and is used at 9–13 px |
| moss on parchment / on card | 4.9 / 5.3 | "Found" value, best lines |
| sienna on parchment | 5.8 | "Missed" value, error box |
| `#a84a3a` on parchment | 4.6 | sync danger button and error line (12 px) |
| **gold on parchment** | **2.2** | folder icons, ★ markers, focus border on inputs |
| **ink-faded at 70 % on parchment** | **2.8** | `.ctrl-kbd` key hint (10 px) |
| **disabled card (45 % opacity)** | **≈2.5** | "coming soon" cards |
| gold on the dark cards | 4.4 | featured count line (11 px mono), "Begin Grand Tour →" |
| gold-bright on dark | 5.8 | daily CTA, streak, record banner |
| parchment at 55 % on dark | 4.7 | "Next puzzle in" (12 px italic) |
| ink on gold | 5.4 | Share button, Daily badge |
| **white on moss-bright** | **4.0** | correct choice, "Copied" state |
| **white on sienna at 75 % opacity** | **4.3** | wrong choice |
| **moss-bright on ink** | **3.6** | name inside a "correct" toast |
| `#d47d6a` on ink | 4.8 | name inside a "wrong" toast |

Over satellite imagery nothing is guaranteed: borders are `rgba(255,248,230,0.7)` hairlines, the credit is 10 px at 75 % opacity on a 55 % ink chip (L1132–1146), and state fills are 50–55 % transparent.

**Target sizes** (CSS px; measured where marked): zoom buttons 38×38 (L972–973, **[run]**) · back button 99×34 **[run]** · Skip 60×32 on a phone **[run]** · modal close 32×32 (L2261–2262) · difficulty segments ≈ 26 px tall (L360) · sync mini-buttons ≈ 26 px (L2340) · "Start learning over from one" is a 13 px text link. Small countries get a 22 px invisible halo (L772–779).

**Small text**: 9 px stat labels on phones (L2444), 10 px stat labels, key hint and imagery credit (L642, L1242, L1139), 11 px count lines and stat labels (L491, L1372, L1489, L1542), all uppercase with wide tracking.

---

## 10. Function index (UI-building and UI-mutating code)

| Area | Function — lines |
|------|------------------|
| Boot | `init` L3781–3816 · startup prefs L7354–7355 · `wireSyncModalChrome()`, `wireFocusChooserChrome()`, `init()` calls L8216–8219 |
| Links | `linkSlugs` L3828–3835 · `slugForStartArg` L3837–3840 · `baseUrl` L3842–3844 · `levelLink` L3847–3851 · `setAddressBar` L3854–3858 · `menuViewForStartArg` L3861–3871 · `openLinkedLevel` L3874–3891 |
| Menu | `bestLabel` L3915–3928 · `folderBestLabel` L3933–3979 · `renderMenu` L3981–3989 · `renderMainMenu` L3992–4136 · `startDailyCountdown` L4141–4162 · `showDailyAlreadyPlayed` L4168–4171 · `renderContinentsMenu` L4174–4194 · `renderUsMenu` L4197–4243 · `renderUsCitiesMenu` L4248–4291 · `renderProvinceRoundCard` L4294–4306 · `renderProvincesMenu` L4310–4330 · `renderPinsMenu` L4333–4365 · `renderRussiaMenu` L4368–4380 · `renderSubMenuHeader` L4385–4396 · `DIFFICULTY_INFO` L4398–4402 · `renderModeToggles` L4407–4437 · `attachMenuHandlers` L4441–4482 · `countEligibleInContinent` L4484–4491 · `initModeToggles` L7359–7377 |
| Game start | `resolveGameTarget` L4499–4523 · `targetNoun` L4526–4530 · `startGame` L4537–4740 (opts: `practice`, `dailyReplay`, `learn`, `learnFresh`) · `startDailyReplay` L4744–4746 · `showLoadingOverlay` L4748–4758 · `hideLoadingOverlay` L4759–4762 |
| Map + play | `renderMap` L4773–4996 · `isEligible` L5003–5030 · `nextCountry` L5032–5104 · `highlightPromptedState` L5109–5116 · `renderCapitalChoices` L5120–5137 · `handleCapitalChoice` L5139–5206 · `handleCountryClick` L5208–5292 · `revealTargetFeature` L5297–5319 · `ensureFeatureVisible` L5322–5350 · `showRevealMarker` L5354–5376 · `handleCityClick` L5380–5432 · `revealMissedCity` L5436–5458 · `ensureCoordsVisible` L5462–5485 · `showRevealMarkerAtCoords` L5489–5506 · `handleSkip` L5508–5556 · `updateStats` L5558–5589 · `flashScore` L5591–5597 · `showToast` L5599–5606 |
| Results | `finishGame` L5608–5764 · `renderRecordsBanner` L5767–5792 · `renderBestsSection` L5795–5840 · `finishPinGame` L6535–6629 · `finishLearn` L7168–7202 · `setLearnResultsLabels` L6854–6860 |
| Satellite | `satEnabled` L5878–5880 · `applyMapStyle` L5883–5892 · `toggleMapStyle` L5895–5902 · `satReset` L5905–5912 · `satOnZoom` L5915–5919 · `satFollowTransform` L5922–5930 · `satRedrawSoon` L5932–5936 · `satSetLoading` L5938–5940 · `satTile` L5943–5977 · `satRedraw` L5982–6001 · `satPlan` L6005–6098 · `satDraw` L6102–6238 |
| Records / focus | `recordsKeyFor` L6277–6285 · `getRecords` L6287–6290 · `commitSessionRecords` L6295–6348 · `formatTimeSeconds` L6350–6355 · `getFocusList` L6392–6395 · `saveFocusList` L6397–6401 |
| Pin | `pinPoints` L3185–3188 · `handlePinClick` L6436–6447 · `handlePinButton` L6450–6457 · `setPinButton` L6459–6463 · `pinReveal` L6466–6489 · `drawPinLayer` L6494–6524 · `scalePinMarkers` L6527–6532 · `pinTrendArrow` L6632–6641 · `recordPinGame` L6694–6703 · `pinRegionStats` L6730–6741 · `pinWeakestCities` L6744–6756 · `pinBestLabel` L6759–6764 |
| Learn | `createLearnRun` L6823–6836 · `setLearnChrome` L6840–6852 · `startLearnLevel` L6863–6899 · `drawLearnStudy` L6902–6914 · `placeLearnLabels` L6923–7020 · `setLearnHint` L7023–7027 · `learnStudyPromptLabel` L7029–7032 · `clearLearnStudy` L7115–7120 · `scaleLearnLabels` L7124–7132 · `beginLearnQuiz` L7135–7147 · `learnLevelPassed` L7149–7159 · `learnLevelFailed` L7161–7165 |
| Chooser | `chooseAndStart` L7211–7220 · `openFocusChooser` L7223–7284 · `closeFocusChooser` L7286–7288 · `wireFocusChooserChrome` L7291–7300 |
| Share | `buildShareText` L7383–7464 · `difficultyBadge` L7468–7471 · `buildDailyShareText` L7475–7495 · `shareDailyResultFromMenu` L7498–7512 · `shareTextOrCopy` L7516–7541 · `shareResults` L7543–7576 · `buildPinShareText` L6644–6662 |
| Screens / events | `switchScreen` L7582–7592 · button bindings L7598–7627 · zoom buttons L7630–7641 · keydown L7643–7671 · resize L7681–7743 |
| Sync UI | `renderSyncEntry` L7965–7979 · `wireSyncEntryButton` L7981–7985 · `syncOpenModal` L7993–7998 · `syncCloseModal` L7999–8002 · `syncRenderModalContent` L8004–8014 · `syncRenderSetupView` L8016–8040 · `syncRenderAuthedView` L8042–8071 · `syncWireSetupHandlers` L8073–8127 · `syncWireAuthedHandlers` L8129–8199 · `wireSyncModalChrome` L8202–8214 · lifecycle `syncOnAppLoad` L7953–7957, `syncAfterGameEnd` L7958–7961 |

Not checked: real Esri imagery and the live site (unreachable from the sandbox); Safari/Firefox rendering; real touch devices. Screenshots of the game screen itself could not be taken in the headless browser (the SVG map times the capture out), so game-screen facts are from DOM measurements and reading.
