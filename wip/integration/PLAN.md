# Atlas overhaul — product plan for the integration stages

Read `$S/BRIEF.md` first (`$S` = `/tmp/claude-0/-home-user-atlas-game/7ba1e6a5-1a5b-5e2b-9103-7f072aa14db0/scratchpad`).
This file is the target every integration stage builds toward. All work lands in ONE file,
`/home/user/atlas-game/public/index.html` (plus `functions/api/records.js` where noted). Stages run one
after another on that file; never assume it still looks the way an inventory describes — grep for the
current state before editing.

Reference material (read what your stage needs, not all of it):
- `$S/maps/ui-inventory.md` — every screen, string, storage shape, JS↔CSS contract, defect list D1–D15.
- `$S/maps/map-port-checklist.md` — every map touchpoint, bugs B1–B10 (used by the globe stage).
- `$S/work/design/a/` — the chosen design, "Editorial Atlas": `src/styles.css` (lift from this),
  `src/body.html`, `src/icons.html`, `NOTES.md`; screenshots in `$S/shots/design/a/`.
- `$S/work/mastery/mastery.js` (+ `SPEC.md`) — per-item learning history module.
- `$S/work/data/world-facts.js` — capitals / ISO codes / typed aliases (used by a later stage).
- `$S/work/globe/` — the WebGL globe engine (used by the globe stage).

## 1. Design direction (decided)

Mockup A, "Editorial Atlas", is the base: Cormorant Garamond for titles, prompts and big numerals; Inter for
everything you operate; hairline rules and whitespace; quiet cards one step lighter than the page; gold is
the only accent; one moss mastery ramp (new → learning → familiar → mastered) used everywhere, always next
to a count. Light theme "Parchment", dark theme "Night Chart", from one semantic token layer. Lift A's
tokens, components and layouts from `src/styles.css` — do not redesign.

Grafts and changes on top of A:
- From C: a level row's trailing slot shows a status pill ("3 due") when there is something to do and a
  chevron otherwise. Each difficulty option in the level sheet carries your best for that difficulty.
  Surfaces that float over the map are near-opaque with NO `backdrop-filter` (blurring over a WebGL canvas
  costs a re-blur every frame); glass is fine on the top nav of non-map screens.
- From C: each collection gets a small icon tile (stroke icon, gold on sunk surface) — icons, not per-
  subject hues. Colour stays reserved: gold = act here, moss ramp = mastery, good/second/bad = outcomes.
- Phones: prompt card at the top of the game screen (a tapping hand covers the bottom), Skip at the bottom
  centre, map controls bottom right above the Skip row.
- Not adopted: per-subject colours (C), floating HUD clusters and the home hero globe (B) — the home globe
  may come back once the engine is integrated.

Hard rules from the owner that the design must respect: no hint buttons; no hover tooltips (no `title=`
attributes on controls — use `aria-label`); no public leaderboards; nothing about live multiplayer; don't
regenerate favicons or the OG image; keep the cartographic identity.

## 2. Information architecture

Four top-level views plus the game flow. Desktop: sticky top nav (brand mark + name, Home / Explore / Stats /
Settings, activity-streak chip, theme toggle). Phones: brand bar on top, four-tab bottom bar. The game and
results screens hide both.

Screens are sibling `.screen` elements; exactly one has `.active`. Keep these ids (tests and deep links rely
on them): `#menu-screen` (Home), `#game-screen`, `#results-screen`. New: `#stats-screen`, `#settings-screen`,
`#explore-screen` (the Explore tab and screen are added by a later stage — build the nav from a small
`VIEWS` registry so adding it is one entry; until then show three tabs). The address bar: `#stats`,
`#settings`, `#explore` select a view; no hash = Home. Use `history.replaceState` like `setAddressBar`
does today, and handle `hashchange` so the browser back button and hand-typed hashes work.

### Home (`#menu-screen`)
1. **Masthead**: date eyebrow, a greeting by time of day ("Good morning." / "Good afternoon." / "Good
   evening."), one sentence built from real state (due count, whether today's Daily Five is done), and a
   three-figure summary: places mastered (of total), first-try accuracy (last 30 days), day streak (longest).
   A brand-new player (no history) gets a welcome line and "—" figures, not zeros dressed up as data.
2. **Today**: the Daily Five card (unplayed: week strip + "Play today's five"; played: today's five result
   marks, score, countdown to the next puzzle, Share — everything today's card offers, see inventory §2.7,
   and fix D4) and the Smart Review card (due count, a few names, "Start review"; empty state when nothing is
   due: "Nothing due. Places you miss come back here when it is time to see them again.").
3. **The Library**: heading, global Difficulty (Normal / Hard / Uncharted) and Map (Chart / Satellite)
   segmented controls with the one-line description of the selected difficulty, collection chips that jump
   to a collection, then every collection with ALL of its level cards visible. No folders: the old
   sub-menus (`continents`, `us`, `us-cities`, `provinces`, `provinces-russia`, `pins`) disappear.

Collections and levels (titles are display text; see the storage-key warning in §5):

| Collection | Levels |
|---|---|
| World & Continents — "Find every country on the globe" | The World, Africa, Asia, Europe, North America, South America, Oceania |
| United States | States, States → Capitals, Capitals → States, Cities: Northeast / Midwest / South / West |
| Provinces & States | Canada, China, India, Russia (three rounds) |
| Pin the City | World, Africa, Asia, Europe, North America, South America, Oceania |

A later stage adds "Capitals & Flags" and "Name It". Build the library from ONE registry so that is cheap:

```js
// Every playable level, in library order. Home, the level sheet, Stats, Smart Review and level links
// all read this; nothing else lists levels.
const LEVELS = [
  { key: 'world', collection: 'world', title: 'The World', arg: 'World', mode: 'world-country',
    skill: 'country', noun: 'countries', names: () => [...] },
  ...
];
```
- `key` is the `?play=` slug (keep every slug `linkSlugs()` produces today), `arg` is what `startGame()`
  takes today, `names()` returns the level's item names (the same strings the game uses as `state.current`
  names / mastery names), `skill` is the mastery skill (§4).
- Level card (A's `.level`): title, item count, mastery ring from `mastery.summary(skill, names())`, best
  for the selected difficulty (from `atlas-records`; fix D3), trailing pill ("5 due" / "New") or chevron.
  Collection header: icon tile, title, one-line description, "123 of 184 mastered" + segmented mastery bar.
- Clicking a level card ALWAYS opens the level sheet.

### Level sheet (replaces the "focus chooser" modal)
Centred two-column dialog on desktop, bottom sheet with a pinned Start button on phones. Contents: title,
count, mastery breakdown (new / learning / familiar / mastered with counts), "How to play" options — Play
(full round), Focus practice (only when the level has a saved focus list; show its size), Learn (only where
Learn exists today: province levels; later stages may widen it) — a Difficulty picker whose options carry
your best for that difficulty, the Map style control, and Start. Esc / backdrop / close button dismiss;
focus is trapped and returns to the card. Difficulty and map style chosen here are the same global
settings as on Home.

### Deep links
`?play=<slug>` starts a fresh full round of that level straight away (it is a "play" link);
`?play=<slug>&learn=1` opens Learn; `?play=daily` opens the Daily Five. An unknown or unplayable slug lands
on Home with a short toast and writes nothing (fix D7). Share text keeps linking via `levelLink()`.

### Game screen
A's `.gamebar` (back, level title + difficulty tag, "23 of 54", score, time, 2px progress line), `.prompt`
card (eyebrow = the mode's prompt label, "second try" marker, the name in Cormorant), `.toast` feedback,
`.skip` (with the `S` key cap on desktop), map controls (zoom in / out / recentre), outcome legend, the
Esri credit whenever imagery shows. Every HUD variant in inventory §6 must still exist (capital modes, city
dots, Pin the City's Drop Pin flow and distance readout, Learn study/quiz panels, review mode, Uncharted).
Keyboard shortcuts stay as they are (§6.4).

### Results screen
Three-arc score ring (first try / second try / missed), new-record badge, outcome counts, time, accuracy,
mastery gain for the round ("+6 mastered" with the level's bar; compare `mastery.summary` before and after),
"Places to revisit" list (missed and second-try names with their marks), and actions: Play again, Practice
these (focus round), View on the map (today's review mode), Share, Back to the Atlas. Every variation in
inventory §5.2 (daily, practice, pin, learn) must still be covered, and Share text is unchanged.

### Stats (`#stats-screen`)
- KPIs: places mastered (of total across all levels' unique skill items), first-try accuracy (30 days),
  day streak (current / longest), rounds played, time played.
- Mastery by collection and level: stacked four-step bars with printed counts (no hover layer — every value
  is printed).
- Activity: 12-week calendar from `mastery.activity()`; legend; totals for the period.
- Needs work: the weakest items across skills (`mastery.weakest`), each with its skill label and first-try
  rate, and a "Practice these" action (per level, through the same practice path as Smart Review).
- Records: every level × difficulty that has been played — best score, best time (clean sweeps), best
  accuracy, rounds, last played. A table on desktop, rows on phones.
- Daily Five: current and best streak, the last 30 days as a strip, score distribution.
- Pin the City: per region — rounds, best score, average distance; recent average-distance trend.
- Empty states for a new player on every panel.
(A mastery globe joins this page in the globe stage.)

### Settings (`#settings-screen`)
Theme (Parchment / Night Chart / Match system), default difficulty, map style, reduce motion (default
follows the OS setting), Sync (today's whole flow — create a username, show / copy the sync code, link
another device, sync now, status and last-synced time, unlink — restyled; the modal steps in inventory §1.4
may stay a modal launched from here), Data (Export my progress as a JSON download; Reset progress behind a
confirm dialog that says exactly what is erased), About (what the app is, credits: Natural Earth, Esri World
Imagery, fonts; link to share the app). The old "Sync" entry on the main menu goes away; the top nav shows a
small sync status dot only when sync is set up.

## 3. Themes and tokens
- `<html data-theme="light|dark">`, chosen by `localStorage["atlas-theme"]` = `'light' | 'dark' | 'system'`
  (default `'system'` → `prefers-color-scheme`). Set the attribute from a tiny inline script in `<head>`
  before first paint so there is no flash; `<meta name="theme-color">` follows the theme.
- Keep the brand palette tokens (`--ink`, `--parchment`, `--gold`, `--sepia`, `--moss`, `--sienna`, …) and
  add A's semantic layer (`--bg`, `--surface`, `--text`, `--rule`, `--accent`, `--good/--second/--bad`,
  `--m0…--m3`, `--g-*` …). Components use the semantic layer only. No hardcoded colours where a token exists.
- Fonts: Cormorant Garamond + Inter from Google Fonts with `display=swap` and solid system fallbacks
  (the app must look right offline with fallbacks). Fix D11 (only request weights that are used).
- Motion: honour `prefers-reduced-motion` and the Settings switch (`data-motion="reduce"` on `<html>`).
  Entrance animations run once per navigation, not on every re-render (fix D9).

## 4. Mastery (learning history)
`mastery.js` is pasted into the script as its own section and created once: `const mastery = Mastery.create();`

Skills (what is being learned — shared across levels that teach the same thing):

| Skill | Levels that feed it | Item name |
|---|---|---|
| `country` | The World, each continent, Daily Five | canonical country name |
| `us-state` | States | state name |
| `us-capital` | States → Capitals, Capitals → States | state name |
| `us-city` | the four Cities levels | the city name the game uses |
| `province:<country>` (`canada`, `china`, `india`, `russia`) | that country's rounds | province display name |
| `city-pin` | Pin the City | the city name (make it unique if two cities share a name) |

Recording rules:
- Record one outcome when a question is resolved (the `state.sequence.push(...)` sites): 2 points → `first`,
  1 → `second`, 0 (missed twice or skipped) → `miss` — `Mastery.OUTCOMES[points]`.
- Pin the City: points ≥ 80 → `first`, ≥ 40 → `second`, else `miss`.
- Full rounds, Daily Five, focus practice and Smart Review all record. Learn-ladder quizzes do NOT record
  items (the ladder repeats names many times a sitting).
- `mastery.recordSession({ questions, firstTry, seconds })` once per finished round (including practice and
  a passed Learn level, which counts as activity). Abandoned rounds keep their item outcomes but are not a
  session.
- Sync: `mastery: mastery.exportBlob()` in the payload, `mastery.mergeBlob(remote.mastery)` on pull; call
  `mastery.reload()` on the window `storage` event. Raise `MAX_BODY_BYTES` in `functions/api/records.js`
  from 64 KB to 256 KB (the payload with mastery reaches roughly 70–105 KB for a heavy player), and make a
  413 visible in the sync status instead of failing silently.
- Reset progress must survive sync: keep `localStorage["atlas-reset-at"]` (ms) and send it as `resetAt`.
  On pull, a remote `resetAt` newer than the local one wipes local progress stores first and adopts it; an
  older one means the remote blob predates this device's reset — skip merging it and push.

Smart Review: gather due items per skill (`mastery.due`), map each to a host level that can run a practice
round with exactly those names (`startGame(arg, { practice: names })`): `country` → The World; `us-state` →
States; `us-capital` → States → Capitals; `us-city` → the item's region level; `province:*` → the item's
round; skip skills whose mode cannot run a practice subset. A review is a short playlist of practice rounds,
largest first; the results screen offers "Next: 6 US states" until the playlist is empty. Practice rounds
never touch `atlas-records` or the focus list (as today) but do record mastery.

## 5. Things that must not break
- **Storage keys are display labels in places.** Records, focus lists and daily data are keyed by strings
  such as continent names and mode labels (inventory §4 and its warning). New titles are presentation only:
  never change what is written to or read from `atlas-records`, `atlas-focus`, `atlas-pin`, `atlas-learn`,
  `atlas-daily-attempts`, or a returning player loses progress. Verify with a seeded old store.
- localStorage is the source of truth; everything works offline once loaded; sync mirrors it.
- The JS↔CSS contracts in inventory §8.6 — if you rename a class or id the JS toggles, change both sides.
- Daily Five generation is deterministic; do not touch its PRNG, epoch or tier lists.
- Every existing mode and flow keeps working. One file, no build step, no framework, existing code style.

## 6. Test hook and checks
- The script exposes one small read-mostly hook at the end of the IIFE for automated checks:
  `window.__atlas = { state, mastery, LEVELS, startGame, version: 2 };` (later stages add to it).
- `$S/harness/atlas-harness.js` serves the app with the CDNs and tile host mocked. `$S/harness/smoke.js`
  (when present) plays every level type end to end — run it before you finish and fix what it finds.
- Syntax check before finishing: extract the `<script>` block(s) and run `node --check` on each.
- Take screenshots (desktop 1280×800 and phone 390×844, light and dark) of what you built into
  `$S/shots/app/<stage>/` and LOOK at them. Compare against `$S/shots/design/a/`.
- Commit your stage in the repo when it passes (one commit, imperative subject, body says what and why;
  the orchestrator pushes). End the commit message with exactly:
  ```
  Co-Authored-By: (redacted)
  Claude-Session: https://claude.ai/code/session_016wRonfzB1ykfySm71EK6kH
  ```
  Do not push, do not open a pull request, do not add planning documents to the repo.
