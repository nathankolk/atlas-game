# Cartographer's Atlas — Project Reference

**Owner:** Nathan Kolk
**Last updated:** November 17, 2026
**Live at:** `https://atlas.nathankolk.com` (also `https://atlas-game.pages.dev`), which serves whatever is on `main`

This doc is the deeper reference for the game: full feature catalog, design decisions, technical schemas, and tabled ideas. For everyday working context (deploy commands, conventions, gotchas), see `CLAUDE.md` — it's the orientation doc and loads automatically in Claude Code.

---

## What this project is

A geography learning app with a parchment-and-compass aesthetic. Players learn the world's countries four ways (find them on the globe, name them, their capitals, their flags), the US states, capitals and cities, the provinces of Canada, China, India and Russia, and where the world's big cities are. The app remembers how well each place is known, brings places back for review when they are due, keeps personal records, and has a daily challenge à la Wordle with share-friendly results.

The whole game lives in **one HTML file** (`public/index.html`, about 770 KB and 16,700 lines) with embedded CSS and JavaScript — no build step, no frameworks. Everything it needs is served from the site's own origin:

- `public/vendor/` — d3-array, d3-geo, topojson-client and earcut (minified, loaded by `<script>` tags) and the flag font. `public/vendor/README.md` lists each file's version, source and licence.
- `public/data/` — the map files, all TopoJSON: the world at 1:50m and 1:110m (the world-atlas package's files, Natural Earth), the US states, and one file per province country.

The only third-party origins are Google Fonts (Cormorant Garamond and Inter, `display=swap`, with system fallbacks so the app looks right without them) and, when satellite imagery is on, Esri's World Imagery tile server.

---

## The app, screen by screen

Four views share a top navigation on desktop and a four-tab bar on phones: **Home**, **Explore**, **Stats**, **Settings**. The address selects a view (`#explore`, `#stats`, `#settings`; no hash is Home), so the browser's back button and hand-typed addresses work. A round and its results take the whole window.

### Home
1. **Masthead** — the date, a greeting by time of day, one sentence built from real state (how many places are due, whether today's Daily Five is done), and three figures: places mastered (of 1,158), first-try accuracy over the last 30 days, and the day streak. A brand-new player gets a welcome line and no figures dressed up as data.
2. **Today** — the Daily Five card (unplayed: the week so far and "Play today's five"; played: today's five marks, score, a countdown to the next puzzle, Share, Practice Replay) and the Smart Review card (how many places are due, a few names, "Start review"; "Nothing due" when that is the case).
3. **The Library** — Difficulty (Normal / Hard / Uncharted) and Map (Chart / Satellite) controls, chips that jump to a collection, then every collection with all of its level cards on show. No folders. A level card shows its count, a mastery ring, the best for the selected difficulty, and a pill when something is due or it is new.

### Level sheet
Tapping a level card always opens the level sheet (a centred dialog on desktop, a bottom sheet with a pinned Start button on phones): title and count, the mastery breakdown (new / learning / familiar / mastered, with counts), the ways to play — **Play** (the full round, counts toward records), **Focus Practice** (only when the level has a saved focus list), **Learn Them** (where the level has a Learn ladder) — a Difficulty picker whose options carry your best for each, the Map control, and Start. Opening the sheet also fetches and builds the level's own map, so Start goes straight to the first question.

### Game screen
A bar across the top (back, level title and difficulty, "23 of 54", score, time, a thin progress line), the prompt card, a toast for feedback, Skip, map controls (zoom in, zoom out, recentre, satellite on/off), a tally of found / second try / missed, and the Esri credit whenever imagery shows. On phones the prompt card is at the top (a tapping hand covers the bottom) and Skip is bottom centre. On a short, wide window (a phone on its side) the card stands at the left and the globe is centred in what is beside it.

### Results screen
A three-arc score ring (first try / second try / missed), a record badge when one was broken, the outcome counts, time and accuracy, what the round did to the level's mastery, "Places to revisit" (missed and second-try names with their marks), and the actions: Play again, Practice these, View on the map, Share, Home. Daily, practice, Pin the City and Learn rounds each have their own variation.

### Explore
The globe with no round in play. Tap a country or search for one (by name, another accepted spelling, or its capital) to open its place card: flag, capital, the countries it borders, where you stand with it in four skills, and a button that opens its continent's level. "Colour by" paints every country by mastery of one skill, with a counted legend. `#explore=<country-slug>` links to a country. Stats links here ("See it on the globe").

### Stats
Headline figures (places mastered, first-try accuracy, day streak, rounds played, time played); mastery by collection and level as four-step bars with printed counts; a 12-week activity calendar with weekly totals; the places that need work, with "Practice these"; Daily Five streaks, a 30-day strip and score distribution; Pin the City by region and its recent trend; and personal records (a table on wide screens, rows below 900px). Every value is printed — nothing waits behind a hover. Every panel has an empty state for a new player.

### Settings
Theme (Parchment / Night Chart / Match system), Reduce motion, default difficulty and map style, Sync (create a username, show or copy the sync code, link another device, sync now, status, unlink), Data (export progress as a JSON download; reset progress behind a dialog that says exactly what is erased), and About (credits: Natural Earth, Esri World Imagery, the fonts, the flag artwork).

---

## What can be played

Everything playable is one entry in the `LEVELS` registry (55 levels, 52 playable; three US city regions are "coming soon"), grouped by `COLLECTIONS`:

| Collection | Levels | Game mode |
|---|---|---|
| World & Continents | The World (184 countries), Africa, Asia, Europe, North America, South America, Oceania | `world-country`: a country is named, find it on the globe |
| United States | States; States → Capitals; Capitals → States; Cities: Northeast (Midwest, South, West to come) | `us-state`, `us-state-to-capital` (pick from four), `us-capital-to-state`, `us-city` (tap the city's dot) |
| Provinces & States | Canada (13), China (33), India (36), Russia in three rounds (27–29 each) | `province` |
| Capitals | The World and each continent, two ways round: pick the capital from four, or find the country whose capital is named | `capital-pick`, `capital-find` |
| Flags | The World and each continent: a flag is shown, find its country | `flag` |
| Name It | The World and each continent: a country is shown, type its name | `name-it` |
| Pin the City | World, and each continent (20 cities each) | `city-pin`: drop a pin, scored by distance |

Plus the **Daily Five** (`daily-five`), which is one puzzle a day rather than a level.

Notes on counts: the world map has 184 of the atlas's 185 countries (French Guiana is part of France in the map file). Capitals-find leaves out Luxembourg and Djibouti (the capital carries the country's name), so its World level has 182; Flags leaves out Somaliland, Northern Cyprus and Syria (no usable flag glyph), so 181.

### Core mechanics
- **Two tries** — 2 points for a first-try answer, 1 for a second-try, 0 when missed twice or skipped.
- **Marks** stay on the map through a round: found, found on the second try, missed. The three differ in lightness as well as hue, and the tally names them.
- **Difficulty** — Normal; Hard (nothing stays marked, so there is no process of elimination); Uncharted (Hard, on satellite imagery, with no borders: a shape only shows when you answer). Each difficulty has its own records.
- **Satellite** — real imagery under see-through land in any mode; switch mid-round with the layers button or `M`.
- **Reveal** — a missed answer is outlined and ringed, and the globe turns to it when it is out of sight.
- **The globe** — drag to turn (north stays up), wheel or pinch to zoom, on-map buttons, and keys: arrows turn, `+` `-` zoom, `0` recentres, `S` skips, `M` switches the map, `Esc` leaves. In Name It every letter belongs to the answer field, so `Esc` skips there.
- **Focus practice, Learn ladders, Smart Review** — three ways to work on what you don't know yet (below).

---

## The globe

Every mode is drawn on one orthographic globe. There is no flat map, no SVG and no per-country projection.

- **Engine** — the `GLOBE ENGINE` section of the script defines `Globe.create(host, options)`. It knows nothing about the game: callers hand it GeoJSON layers and named fill styles, and it handles drawing, turning, zooming, picking, an overlay canvas for labels and markers, and satellite imagery. Country shapes are triangulated once (earcut) and drawn with WebGL; borders are instanced lines; imagery tiles are reprojected on the GPU. When WebGL is unavailable it falls back to its own Canvas 2D renderer (no imagery). Its header comment is its API reference.
- **One globe for the visit** — it is created straight after Home's first paint and the world is built into it while Home is on show. The game's stage and Explore's stage take turns holding its canvases (`globe.attachTo`), so there is only ever one WebGL context.
- **Layers** — `world`, `us` and `prov` (the provinces of one country at a time), keyed by `featureKey(f)` (`'name:' + the feature's raw name`). A round shows the layers it needs and paints them; whatever it puts on the map (marks, tints, outlines, dots, labels) is kept as plain data in `const map`, so the picture can be painted again after a theme change, a resize, or for "View on the map".
- **Colours** — the `--g-*` CSS tokens, read off the stage by `applyMapLook()`, which is the one place they reach the engine. `--g-land` is the round's own land and `--g-dim` the land around it.
- **Framing** — the globe's middle is the middle of what the HUD leaves clear. A continent opens on a curated box; on a stage taller than it is wide (a phone held upright) Europe, Africa and North America open instead on the places that bound their countries (`TALL_FRAMES`: capes, corners, island states), centred as drawn, so the countries take the width. US rounds open on the lower 48 (Alaska and Hawaii are a turn away), cities and provinces on their own features, Pin the City on its cities' padded box.
- **Imagery** — Esri World Imagery, the public tile endpoint, used without an API key; the credit line on the map is required and shows whenever imagery does. If no tile loads the map falls back to the chart's look with a notice.

---

## Mastery and Smart Review

The app keeps a learning history for every place in every skill. The rules (this is the spec the module's tests are written against):

- **Skills** — what is being learned, shared by the levels that teach the same thing:

| Skill | Fed by | Item |
|---|---|---|
| `country` | The World, each continent, the Daily Five | country |
| `country-name` | Name It | country |
| `capital` | both Capitals modes | country |
| `flag` | Flags | country |
| `us-state` | States | state |
| `us-capital` | States → Capitals, Capitals → States | state |
| `us-city` | the Cities levels | city |
| `province:<country>` | that country's rounds | province |
| `city-pin` | Pin the City | city |

- **Recording** — one outcome per resolved question: `first` (2 points), `second` (1), `miss` (0, including a skip). Pin the City: 80 points or more is `first`, 40 or more `second`, else `miss`. Full rounds, the Daily Five, focus practice and Smart Review all record; Learn-ladder quizzes do not (a ladder repeats names many times a sitting). A finished round also adds one session to the day's activity.
- **Scheduling (Leitner boxes 0–5)** — intervals of 0, 1, 3, 7, 16 and 35 days by box. A first-try answer moves the item up a box (at most once per calendar day) and schedules it that box's interval out. A second-try answer caps it at box 2, due tomorrow. A miss sends it to box 1, due again straight away.
- **Levels** — new (never seen), learning (box 0–1), familiar (box 2–3), mastered (box 4–5). "Places mastered" on Home and Stats counts mastered items across every skill, each skill's items once (1,158 in all).
- **Days** are the player's local calendar days; activity keeps 400 days of rows plus lifetime tallies, so totals and streaks don't shrink when old rows are pruned.
- **Merging two devices** — per item the entry with more answers wins (ties: the later day, then the higher box); day rows take the larger of each figure.

**Smart Review** gathers what is due per skill and plays it as a short playlist of practice rounds, largest first, each on a level that can quiz exactly those names: the World level for `country`, `country-name`, `capital` and `flag`; States; States → Capitals; cities and provinces on their own levels. Pin the City has no review rounds. The results screen offers "Next" until the playlist is empty. Review rounds are practice rounds: they record mastery but never touch records or focus lists.

Mastery shows as one moss ramp everywhere (new → learning → familiar → mastered), always next to a count.

---

## More ways to play

### Personal records (localStorage)
Stored under `atlas-records`. Tracks per **game mode × region × difficulty (normal/hard/uncharted)**:
- **Best Score** — highest points earned
- **Best Time** — fastest completion (only counted for clean sweeps)
- **Best Accuracy** — highest percent correct
- **Games Played** + **Last Played**

Records show on level cards, in the level sheet's difficulty picker, on the results screen (a broken record gets a badge), in Stats, and in share text.

### Focus practice (replay just the ones you missed)
Built so big levels like The World stay engaging: drill the shaky ones instead of replaying the 150 you already know.
- **The focus list** for a level = everything missed **or** found only on the second try in the **last full game** of that level. Stored under `atlas-focus`, keyed `gameMode|region` (shared by every difficulty).
- **Only full games rewrite it.** A perfect full game empties it. Quitting mid-game or playing a practice round leaves it alone.
- **Results screen:** "Practice these N" drills exactly that list; after a practice round it drills whatever is *still* shaky.
- **Level sheet:** offers Focus Practice when the saved list is non-empty.
- **Practice rounds don't touch records** (a 20-country round would otherwise "beat" the World bests) and hide Share. They do record mastery. The full map stays clickable so there's no process of elimination.

### Learn ladders
For the six continents, States and the province levels: level n shows the first n names of a shuffled order on the map, then quizzes all n; one miss restarts the level, a clean pass adds the next name. Progress is saved per level (`atlas-learn`), so a ladder can be picked up later. Practice only: no records, no focus list, no per-item mastery.

### Pin the City
A blank globe, a city name, tap to aim, Drop Pin to score: 100 points within 25 km, then falling off with distance (`100·e^(−(km−25)/400)`). 120 cities, 20 per continent; a World round draws 20 of them. Its history has its own store (`atlas-pin`).

### Share results
- Native share sheet on mobile, clipboard on desktop, a dialog with the text to copy as the last resort
- Three-colour emoji grid: 🟩 first try, 🟨 second try, 🟥 missed
- Share text links to the level that was played (`?play=<slug>`)
- Daily mode uses a **spoiler-safe** compact format (no country names)

### Daily Five mode (the social hook)
- **Deterministic puzzle generation** — date string hashed with FNV-1a, fed to Mulberry32 PRNG. Same UTC date produces the same 5 countries for every player worldwide.
- **Difficulty ramp** — Slot 1: Tier 1 (easy/famous). Slot 5: Tier 3 (hard/obscure). Slots 2–4 ramp through Tier 2.
- **Country tiers** are hand-curated: Tier 1 EASY (~45 countries), Tier 3 HARD (~45), Tier 2 everything else, computed at runtime.
- **Once-per-day enforcement** via `atlas-daily-attempts`, with the date as primary key. Trivially bypassable by clearing storage — same as Wordle. Doesn't matter for casual play.
- **Played card** — your five marks, score, share button, practice replay, and a live countdown to the next puzzle (midnight UTC).
- **Streak** — consecutive days played.
- **Practice replay** — re-plays today's exact 5 countries without affecting the day's result.
- **Share format:**
  ```
  🧭 Atlas Daily #57
  4/5 found · 7/10 pts

  🟩🟨🟩🟥🟨

  https://atlas.nathankolk.com
  ```
- **Daily epoch:** `2026-04-26` is Day 1 (so the puzzle number `Daily #N` is meaningful).

### Level links
`?play=<slug>` starts a fresh full round of that level on load; `&learn=1` opens its Learn ladder where it has one; `?play=daily` opens the Daily Five. Slugs are the level keys: `world`, `europe`, `north-america`, `us-state`, `us-state-to-capital`, `northeast-cities`, `china-provinces`, `india-states`, `russia-west`, `capitals-europe`, `capitals-find-europe`, `flags-asia`, `name-world`, `pin-oceania`, and so on. A level link puts a globe on screen at once (drawn from the coarse world file) while the detailed map loads. An unknown slug lands on Home with a notice and writes nothing.

---

## Look, themes and accessibility

- **Design** — "Editorial Atlas": Cormorant Garamond for titles, prompts and big numerals; Inter for everything you operate; hairline rules and whitespace; quiet cards one step lighter than the page; gold is the only accent; one moss ramp for mastery. Things that float over the map are near-opaque and never use `backdrop-filter` (a blur over a WebGL canvas is redone every frame).
- **Themes** — Parchment (light) and Night Chart (dark) from one semantic token layer (`--bg`, `--surface`, `--text`, `--rule`, `--accent`, `--good` / `--second` / `--bad`, `--m0`..`--m3`, the map's `--g-*`). `<html data-theme>` is set by a tiny script in the `<head>` before first paint (`atlas-theme`: `light`, `dark` or `system`).
- **Motion** — Reduce motion in Settings (`atlas-motion`) or the OS setting: globe flights become instant, the glide after a drag stops, the reveal rings stand still, and the stylesheet cuts transitions.
- **Keyboard and screen readers** — every control is reachable by keyboard and shows a focus ring that stands 3:1 off every surface in both themes; the level sheet and the dialog trap focus and give it back; Escape closes them, leaves the results and leaves a round. The question is a live region, the answer toast a status, and the results summary takes the focus when it comes up. Controls have names; there are no `title` tooltips.
- **Contrast** — text tiers meet 4.5:1 on every surface in both themes; field, radio and switch edges 3:1. Colour is never the only signal: outcomes carry an icon or a label, mastery a count, and the map's three marks differ in lightness.
- **What a keyboard cannot do** — answer a find-on-the-globe question: those need a pointer. The capitals that are picked from four and Name It are fully playable from the keyboard.

---

## Loading and speed

- The page preloads the 1:50m world map alongside itself and draws Home as soon as it is in. The globe is created after that first paint and the world is built into it in slices while Home is on show.
- Nothing else is fetched until it is needed: the coarse world for a level link, the US states or a province file when that level's sheet opens, the flag font when a flag is about to show, imagery tiles when Satellite is on.
- A round start measures the game's layout once, sizes the globe's canvases once, and puts the first question up at once.

Measured on the development machine in November 2026 (headless Chromium with a software GL driver, local server, Google Fonts answered from memory; medians of 3–8 runs). "Old" is the app before the overhaul (commit `1c74e1d`: SVG map, d3 from a CDN).

| | Old app | After the overhaul, before tuning | Now |
|---|---|---|---|
| Home usable, desktop | 200 ms | 516 ms | 210 ms |
| Home usable, phone size | — | 646 ms | 218 ms |
| Start → first question, Europe | 479 ms | 172 ms | 59 ms |
| Start → first question, US States (first time) | 668 ms | 304 ms | 76 ms |
| Start → first question, India (first time) | — | 233 ms | 100 ms |
| Start → first question, Europe on satellite | — | 187–363 ms | 77–91 ms or 261–271 ms (see below) |
| Level link, cold → first question | 600 ms | 832 ms | 660 ms |
| Cold load of Home: requests / transferred (brotli) | 9 / 494 KB | 10 / 508 KB | 10 / 510 KB |
| US states file: raw / brotli | 1,037 KB / 185 KB | same | 445 KB / 132 KB |

On satellite the start times fall into two groups, about half the runs in each: either the first question is up 77–91 ms after Start, or it is up after 261–271 ms. The game's own work is one task of about 70 ms in both cases and no long task was recorded in the extra wait, so the likeliest cause is the question's task falling behind a frame the software GL driver was still drawing; what a real GPU does with it could not be measured.

A cold start is the one place the old app still measures faster on that machine: Home is usable some 10–70 ms later and a level link's first question some 60–150 ms later, run to run (a later set of five runs gave 217 against 150 ms and 712 against 558 ms). The page is two and a half times the size to parse (744 KB against 300 KB), and a level link builds the 50m world for the engine before its first question. That is the price of one self-contained file and is accepted; these figures leave out the old app's two extra origins (cdnjs, jsDelivr), which answered from disk here and cost a connection each on a real line.

While the globe is turned or zoomed, the main thread does about 3 ms of work per frame (0.5–0.9 ms of it script), on the chart and on satellite alike; the old SVG map needed 3–20 ms per frame for style, layout and paint, and a further 50 ms of reprojection after each gesture on satellite. Frame *rates* could not be measured: that machine has no GPU. The JS heap is about 11 MB on Home and about 18 MB after ten rounds, and stays there after twenty.

---

## Recent removals (don't re-add without asking)

- **Hint button** — removed entirely, including state.hintUsed, the function, the H key shortcut, and the prompt-area hint-text element. User found it unhelpful.
- **Hover tooltip (the question mark)** — removed entirely, including the tooltip element, CSS, and three hover handlers. Sometimes lingered on mobile. The app has no `title=` attributes either; charts print every value.
- **The flat maps** (Nov 2026) — Natural Earth, Mercator, Albers USA with its insets and the conics, the SVG renderer, d3.zoom and the CPU satellite reprojection all went when the globe came in.
- **The folder menus and the sync modal** (Nov 2026) — the Library shows every level; sync lives in Settings.

---

## Cross-device sync (Phase 1)

User wants progress to sync across phone and laptop. **Group leaderboards were considered and explicitly scratched** — for a knowledge quiz, daily mode provides enough social hook on its own without the moderation burden.

### Architecture
- **Frontend:** the single-file HTML game, with the SYNC section near the end of its script and a Sync card in Settings.
- **Backend:** Cloudflare Pages Function exposing `GET /api/records?token=...` and `POST /api/records?token=...`.
- **Storage:** Cloudflare KV namespace (`RECORDS_KV`), one row per user (key = secret token, value = JSON blob).
- **Auth model:** No passwords. Each user creates a username locally; the app generates a 128-bit random secret token stored in localStorage. To link a second device, the user views the sync code on device 1 and types it on device 2. Same model as Signal device linking.
- **localStorage stays the source of truth.** The API mirrors it — the game works fully offline, and when the API is unreachable Settings says so and nothing is lost.

### What is synced
The payload is one JSON object: `records`, `dailyAttempts`, `focusLists`, `pin`, `learn`, `mastery` and `resetAt`. Each store merges by its own rule (records keep the better figure, focus lists the newer save, the pin store a union, mastery as described above). Difficulty, map style, theme and motion are per device and are not synced.

- **Size** — the Function accepts up to 256 KB and answers 413 `payload_too_large` beyond it (Settings shows that). A heavy player (every level played daily for over a year, every item seen) sends about 120 KB; the most the stores can hold at their caps is about 157 KB.
- **When** — on load and when the page comes back into view: pull and merge, then push if an earlier push never got through (`unsent` in `atlas-sync-meta`; its error stays in Settings until it does). At the end of every round: pull, merge, push. "Sync now": the same.
- **Reset** — "Reset progress" writes the time to `atlas-reset-at`, which travels as `resetAt`. A pull that carries a newer reset erases what this device holds from before that moment and keeps what it has played since: dated entries (daily attempts, focus lists, ladders, pin games) by their own time; records and the mastery store, which are tallies, by playing back the notes the device keeps of each answer and finished round since its last pull (`atlas-sync-notes`, dropped at every pull that merges). A blob older than this device's reset is not merged and is overwritten on the next push.
- **Known limits** — figures that are tallies merge by taking the larger, not by adding: `gamesPlayed` in a record, the mastery store's day rows (rounds, answers, first tries, seconds) and, per place, the history with more answers. They add up when devices take turns, because each pulls before it plays on. Rounds played on two devices at the same time, or on one that is offline, are counted once where they overlap: the day shows the busier device's figures.

### Status — **shipped**
- **Backend Function:** deployed at `functions/api/records.js`
- **KV namespace:** provisioned (`eda12720123441638f8261e2d19efcff`), bound via `wrangler.toml`
- **Cloudflare Pages:** live at `atlas.nathankolk.com` and `atlas-game.pages.dev`
- **GitHub auto-deploy:** wired up May 23, 2026. Repo at `github.com/nathankolk/atlas-game`; pushes to `main` auto-deploy to production.
- **Client-side sync UI:** verified end-to-end June 2, 2026; moved into Settings in the November overhaul.

---

## Tabled future ideas (don't build without checking)

- **Live Kahoot-style mode** — multiplayer rooms with WebSockets via Cloudflare Durable Objects. Requires Workers Paid plan ($5/mo minimum). User explicitly wanted this as Phase 2 after Phase 1 shipped. Phase 1 is now shipped; don't pre-empt — Nathan will raise it when he's ready.
- **Daily archive** — let players catch up on yesterday's puzzle if they missed it (with "Catch-up" badge so it doesn't count for streak).
- **Hand-curated daily puzzles** — now that the sync layer exists, hand-pick puzzles for themed days (holidays, etc.) instead of pure random tier shuffle.
- **US city regions** — Midwest, South and West are registered as levels but have no cities yet; they show as "coming soon".

---

## Technical reference

### Where things are in `public/index.html`
The stylesheet first (tokens, components, one section per screen, then tablet and phone rules), then the icon sprite and the markup of each screen, then the vendored scripts, then one script. The script's banners, in order: CONTINENT MAPPING, WORLD FACTS, US data, PIN THE CITY data, PROVINCES, DAILY PUZZLE, GAME MODE DEFINITIONS, DATA LOADING, LEVELS, LEVEL LINKS, HOME, SMART REVIEW, LEVEL SHEET, STATS, GAME, RESULTS, MAP, SATELLITE IMAGERY, EXPLORE, GLOBE ENGINE, MASTERY (the module), QUIZ LOGIC, MASTERY (the game's side), PERSONAL RECORDS, FOCUS LISTS, PIN THE CITY (play, store), LEARN MODE, preferences, SHARE RESULTS, DIALOG, SETTINGS, THEME & MOTION, APP SHELL, EVENT BINDINGS, PROGRESS, SYNC.

### Modules and their tests
The globe engine, the mastery module, the quiz module and the world-facts table stand on their own inside the page, between a banner and an END marker. Their tests live in `tools/tests/` and read each module's text straight out of `public/index.html` (`extract.js`), so what is tested is what is served:

```bash
node tools/tests/run.js            # world facts, quiz, mastery (two suites)
node tools/tests/run.js --globe    # plus the globe engine, in headless Chromium (needs Playwright)
```

`tools/tests/fixtures/` holds what the quiz suite types at the matcher (`places-in-game.json`, rebuilt by `fixtures/build-places.js` after adding a level; `judged-inputs.json`, spellings judged by eye) and the flags the font cannot draw. `tools/tests/globe/` holds the engine's test page, a small demo page, and the harness that serves them with stand-in imagery tiles.

### Map data and how it was made
- `countries-50m.json`, `countries-110m.json` — the world-atlas package's files (v2.0.2), unchanged.
- `provinces-*.json` — built by `tools/build-provinces.js` from Natural Earth's 1:10m admin-1 data (usage in its header). Display names and Russia's round groups are baked in.
- `us-states.json` — Natural Earth's 1:10m admin-1, cut down to the fifty states and the District of Columbia, then turned into TopoJSON with topojson-server's `topology({ states: geojson }, 1e6)` (1e6 is the quantization). Checked against the GeoJSON it came from: 51 shapes, the same number of pieces each, areas within 0.05%, every shared border one arc. The GeoJSON is in the repo's history (`public/data/us-states-detail.json`, last present in commit `1330e48`).

### Game modes registry
`GAME_MODES = { ... }`: `world-country`, `daily-five`, `us-state`, `us-capital-to-state`, `us-state-to-capital`, `us-city`, `city-pin`, `province`, `capital-pick`, `capital-find`, `flag`, `name-it`. Each has a `dataset` (`world`, `us` or `province`) and a `label()`. A new level of an existing mode is one `LEVELS` entry. A new mode means:
1. An entry in `GAME_MODES`
2. Queue building in `startGame()`
3. Prompt logic in `nextCountry()` and answer handling
4. `LEVELS` entries (and a `COLLECTIONS` entry if it is a new collection), with the mastery `skill` they feed

### Game state (selected fields)
```javascript
state = {
  // World dataset
  allFeatures, worldBorders, canonicalByFeature, continentByFeature, featureByCanonical, neighbours,
  worldLoading, worldFailed,
  // US and province datasets (loaded when first needed)
  usFeatures, usBorders, usCanonicalByFeature, usFeatureByCanonical, usLoaded, usLoading,
  provinceStores, provinceLoading, currentProvinceRound,
  // The round in play
  activeDataset, gameMode, currentContinent, startArg, roundId,
  eligibleFeatures, queue, current, attempts, picks, roundLog,
  correct, wrong, score, missed, secondTry, sequence, startTime, roundSeconds, interactionLocked,
  practice, review, learn, pin, quiz, roundNeedsWork, gainStart,
  // Daily-specific
  dailyDateKey, dailyReplay,
  // Settings
  difficulty,   // 'normal' | 'hard' | 'uncharted'
  hardMode,     // true for Hard and Uncharted
  mapStyle,     // 'parchment' | 'satellite' (Uncharted is always satellite)
  flagsOff,     // true where no flag can be drawn
  view          // 'home' | 'explore' | 'stats' | 'settings'
}
```
What a round has put on the map lives in `const map` (MAP section), not in `state`.

### Storage reference (localStorage)

Progress stores (synced, exported, erased by Reset progress):

```javascript
"atlas-records" = {
  "world-country|North America|normal": {
    bestScore: { value, max, date },
    bestTime: { value, total, date },     // only for clean sweeps
    bestAccuracy: { correct, total, pct, date },
    gamesPlayed, lastPlayed
  },
  "capital-pick|Europe|hard": { ... },
  "province|russia-east|normal": { ... },
  "daily-five|Daily|normal": { ... }
}
// Key: gameMode|region|difficulty. The region is a stored key (continent name, 'World',
// a province round key), never a display title.

"atlas-daily-attempts" = {
  "2026-04-28": { dateKey, puzzleNumber, countries, sequence, score, correct, wrong, total,
                  timeSeconds, hardMode, difficulty, completedAt }
}
// Trimmed to the last 30 days. `difficulty` was added Nov 2026; older entries only have hardMode.

"atlas-focus" = {
  "world-country|World": { names: ["Bhutan", ...], total: 184, savedAt: 1761140000000 },
  "province|russia-east": { names: [], total: 27, savedAt: ... }   // empty = nothing to practice
}
// Key: gameMode|region (no difficulty). names is missed first, then second tries.

"atlas-learn" = {
  "europe": { order: [...], level: 12, savedAt },   // a ladder in progress, by level key
  "us-state": { done: true, savedAt }               // a finished ladder
}

"atlas-pin" = {
  games: [{ at, region, diff, score, max, avgKm }],        // the last 200
  cities: { "Lagos": [[at, km], ...] }                      // the last 5 drops per city
}

"atlas-mastery" = {
  v: 2,
  items: { "<skill>": { "<name>": [lastDay, box, first, streak, second, missed, dueFix] } },
  days:  { "<dayNumber>": [games, questions, firstTry, seconds] },   // days since 2026-01-01, last 400
  life:  [games, questions, firstTry, seconds, daysActive, longestStreak, runEnd, runLength]
}

"atlas-reset-at" = "1763380000000"   // when progress was last reset (ms); absent = never
```

Per-device preferences (not synced): `atlas-theme` (`light` | `dark` | `system`), `atlas-motion` (`reduce` | `full`; absent = follow the OS), `atlas-difficulty`, `atlas-map-style` (`parchment` | `satellite`), `atlas-capitals-way` (`pick` | `find`: which set of Capitals cards shows). Sync: `atlas-sync-token` (the credential), `atlas-sync-username`, `atlas-sync-meta`. The old `atlas-hard-mode` is still read once as a fallback for the difficulty and never written.

### Sync API shape (`functions/api/records.js`)
- **`GET /api/records?token=<32 hex>`** — returns the stored JSON blob for that token, or the literal string `null` if none exists.
- **`POST /api/records?token=<32 hex>`** — overwrites the blob with the request body (must be valid JSON). Returns `{ ok: true }`.
- **Token format:** 32 hex chars (128 bits). Anything else returns `400 invalid_token`.
- **Body limit:** 256 KB, counted in bytes; over it, `413 payload_too_large`.
- **Trust model:** the token IS the credential. No accounts, no passwords. Anyone with the token can read or overwrite that user's progress. Same risk model as Signal device-linking codes.

### Running it locally
`python3 -m http.server 8788 --directory public` serves everything but sync. `wrangler pages dev public` runs the Function too, with a local KV. See CLAUDE.md for the details and the gotchas.

---

## Project history (the short version)

- **Phase 0:** Single-file HTML game built and iterated locally. Hosted on tiiny.site for casual sharing.
- **Apr 26, 2026:** Daily Five launched (Day 1 of the daily epoch).
- **Apr 28, 2026:** Decision to migrate to Cloudflare Pages so a Worker backend could support cross-device sync. Group leaderboards considered and scratched.
- **May 22, 2026:** Migration complete. Site live on Cloudflare Pages at `atlas-game.pages.dev`. Custom subdomain `atlas.nathankolk.com` wired up via CNAME at Squarespace DNS (nameservers stayed at Squarespace to preserve email records on the root domain). Phase 1 backend deployed.
- **May 23, 2026:** GitHub auto-deploy wired. Repo created at `github.com/nathankolk/atlas-game`; original Direct Upload Pages project deleted and recreated as Git-connected (one-way door per Cloudflare — see CLAUDE.md gotchas). Pushes to `main` now auto-deploy to production.
- **June 2, 2026:** Phase 1 shipped end-to-end. Records mirror across devices through KV using a 128-bit hex token. localStorage stays source of truth so the game still works fully offline.
- **Sept 2026:** Provinces & States (Canada, China, India, Russia) and the Learn ladder.
- **Oct 22, 2026:** Focus practice — every level remembers what you missed or needed two tries on in your last full game, and offers a practice round of just those. Also fixed Daily Five Practice Replay overwriting the day's real result, and the menu not redrawing on return.
- **Nov 5, 2026:** Satellite map and Uncharted difficulty (for maptap.gg practice). The Hard Mode switch became a Normal / Hard / Uncharted picker.
- **Nov 16–17, 2026: the overhaul.** One orthographic globe drawn with WebGL replaced every flat map (and the SVG renderer, d3.zoom, the projections and the CPU satellite code); libraries and map data became self-hosted. A new design system ("Editorial Atlas") with a dark theme, a top navigation and four views: Home with the whole Library on show and a level sheet, Explore, Stats, Settings. A per-place learning history (mastery) with Smart Review; sync grew to carry it (256 KB limit, a reset that survives sync). New ways to learn the countries: Capitals (two ways round), Flags, Name It; Learn ladders for the continents and States. Then a pass for speed (Home and round starts), accessibility (focus, contrast, reduced motion, announcements) and layout at every size, and the module tests moved into `tools/tests/`.
