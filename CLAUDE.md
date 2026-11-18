# Cartographer's Atlas — CLAUDE.md

This file is the orientation doc for Claude Code working in this repo. Read it first. Deeper history and the full feature catalog live in `atlas_handoff.md`.

---

## What this is

A geography learning app with a parchment-and-compass aesthetic, built as a **single HTML file** (`public/index.html`) with embedded CSS and vanilla JavaScript. No build step, no frameworks, no bundlers. The map is a WebGL globe drawn by an engine that lives inside that file; the few libraries it needs (d3-array, d3-geo, topojson-client, earcut) are self-hosted in `public/vendor/` and the map data in `public/data/`. The only third-party origins are Google Fonts and, when satellite imagery is on, Esri's tile server.

It has four views: **Home** (today's Daily Five, Smart Review, and the Library of every level), **Explore** (the globe to look around on), **Stats** and **Settings**. Players learn the world's countries four ways (find them, name them, their capitals, their flags), US states, capitals and cities, the provinces of four countries, and city locations (Pin the City). The app keeps a per-place learning history (mastery) and brings places back for review when they are due, tracks personal records, runs a Wordle-style daily challenge, and ships emoji-grid share results. Everything is stored in localStorage; an optional sync mirrors it across devices. Two themes: Parchment (light) and Night Chart (dark).

Owner: Nathan Kolk. Solo project, family-first orientation (designed in part so his kids can play).

---

## Current status (as of June 2, 2026)

**Live at:** `https://atlas.nathankolk.com` (and `https://atlas-game.pages.dev`)

**Hosting:** Cloudflare Pages, project name `atlas-game`. Custom subdomain configured via CNAME at Squarespace DNS (nameservers stayed at Squarespace; only the `atlas` subdomain is delegated to Cloudflare). Git-connected to `github.com/nathankolk/atlas-game` — pushes to `main` auto-deploy.

**Backend:** Cloudflare Pages Function at `functions/api/records.js` exposes `GET`/`POST /api/records?token=...`. KV namespace `RECORDS_KV` is bound in `wrangler.toml`. The Function is deployed alongside the static site.

**Phase 1 status (cross-device record sync):** **shipped.**
- Backend Worker code: **done and deployed**
- KV namespace: **provisioned and bound**
- Client-side sync UI (username creation, token generation, sync code flow, API calls): **wired in and verified end-to-end**
- localStorage stays the source of truth; the API mirrors it, so the game still works fully offline if KV is unreachable.

**Phase 2 (live multiplayer mode):** tabled. Requires Workers Paid ($5/mo). Don't push toward it — Nathan will raise it when he's ready.

---

## Repo layout

```
Atlas Game/
├── public/
│   ├── index.html              # The game. ~770kb. Source of truth for the frontend.
│   ├── vendor/                 # d3-array, d3-geo, topojson-client, earcut (min.js), loaded by <script> tags;
│   │                           #   TwemojiCountryFlags.woff2, the flag font, fetched when a flag is first shown;
│   │                           #   README.md lists each file's version, source and licence
│   └── data/                   # Map files served same-origin (all TopoJSON)
│       ├── countries-50m.json      # The world every country round is played on; preloaded with the page
│       ├── countries-110m.json     # Coarse world: what a level link's globe shows while 50m loads
│       ├── us-states.json          # Natural Earth 10m US states and DC, loaded when a US level's sheet opens
│       └── provinces-*.json        # Canada/China/India/Russia provinces, loaded per country
├── tools/
│   ├── build-provinces.js      # Regenerates public/data/provinces-*.json from Natural Earth
│   └── tests/                  # Tests of the self-contained modules inside index.html (see below)
├── functions/
│   └── api/
│       └── records.js          # Pages Function. Auto-routes to /api/records.
├── wrangler.toml               # Cloudflare config. KV binding lives here.
├── atlas_handoff.md            # Full feature catalog, project history, technical reference.
├── CLAUDE.md                   # This file.
├── .gitignore                  # Excludes .wrangler/, .DS_Store, node_modules/, editor cruft.
└── .wrangler/                  # Local dev state (gitignored).
```

There's no `src/`, no build output, no `node_modules/` at the project root. The HTML file IS the build artifact. `tools/` is data prep and tests, not a build step: the app never runs it, and it is never served (the site root is `public/`).

---

## How to work in this repo

### Editing the game

Edit `public/index.html` directly. Single file, ~16,700 lines: about 2,300 of CSS, 230 of markup, and one script. Roughly 5,000 lines of that script are three self-contained modules you rarely need to touch (the globe engine, the mastery module, the quiz module). The script's `/* ===== SECTION ===== */` banners are the table of contents; grep for them. Match the existing style:

- `'use strict'` at the top of the script block
- `//` for inline comments, `/* ===== Section Name ===== */` blocks for major dividers
- One-line description comment above non-obvious functions
- CSS uses custom properties (`--ink`, `--parchment`, `--gold`, `--sepia`, `--moss`, etc.) — don't hardcode colors. Components read the semantic layer (`--bg`, `--surface`, `--text`, `--accent`, `--good`/`--second`/`--bad`, the mastery ramp `--m0`..`--m3`, the map's `--g-*`), which is what the Night Chart theme redefines. A new colour is a new token in both themes.
- No semicolons missing, no random formatting changes — match indentation/spacing of surrounding code
- No `title=` attributes (they are hover tooltips); controls get `aria-label`

Before declaring an edit done, syntax-check the JS:
```bash
# Extracts every inline <script> block and runs node --check on each.
node -e "const fs=require('fs');const h=fs.readFileSync('public/index.html','utf8');let m,i=0;const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;while((m=re.exec(h)))fs.writeFileSync('/tmp/atlas-block'+(i++)+'.js',m[1]);console.log(i)" \
  && for f in /tmp/atlas-block*.js; do node --check "$f" || break; done
```

### Module tests

Four parts of the script stand on their own and have tests in `tools/tests/`: the **globe engine** (`GLOBE ENGINE` .. `END OF GLOBE ENGINE`), the **mastery module** (`MASTERY` .. `END OF MASTERY MODULE`), the **quiz module** (`QUIZ LOGIC (quiz.js)` .. `END QUIZ LOGIC (quiz.js)`) and the **world facts** table (`WORLD FACTS` .. `END OF WORLD FACTS`). The page is their one source: each test pulls its module's text out of `public/index.html` with `tools/tests/extract.js` (by those banner and END markers, so keep the markers) and runs it under Node.

```bash
node tools/tests/run.js            # mastery (two suites), quiz, world facts — Node only, a few minutes
node tools/tests/run.js --quick    # the same with smaller samples in the quiz suite
node tools/tests/run.js --globe    # plus the globe engine, in headless Chromium
```

The globe suite needs Playwright (`npm install --no-save playwright && npx playwright install chromium`); it serves the engine and `public/data/` itself and answers imagery requests with stand-in tiles (`tools/tests/globe/harness.js`). After changing one of these modules, run its test before committing. These tests cover the modules only: there is no automated test of the game's screens in the repo, so play what you changed (see Local dev) at desktop and phone width, in both themes.

### Deploying

**Primary path: GitHub auto-deploy.** The Pages project is Git-connected (as of 2026-05-23). Every push to `main` on `https://github.com/nathankolk/atlas-game` triggers a production deploy automatically; pushes to other branches generate preview deploys. To ship:
```bash
cd "/Users/nathan/Documents/Claude/Projects/Atlas Game"
# edit public/index.html
git add public/index.html
git commit -m "..."
git push
```
Build finishes in ~30–60 seconds. Watch the Deployments tab in the Cloudflare dashboard, or just curl the site after a minute.

**Escape hatch: Manual via Wrangler.** Still works on a Git-connected project, but mixing it with git pushes creates a divergent deploy history that gets confusing fast. Use only if git is unavailable or for testing.
```bash
cd "/Users/nathan/Documents/Claude/Projects/Atlas Game"
wrangler pages deploy public --branch=main
```
The `--branch=main` flag is still required when using this path.

### Local dev

Static-only preview (enough for anything that doesn't touch sync):
```bash
cd "/Users/nathan/Documents/Claude/Projects/Atlas Game"
python3 -m http.server 8788 --directory public
```

Full preview with the sync Function (needs Wrangler, which isn't installed on the current Mac — `npm install -g wrangler` then `wrangler login` first):
```bash
cd "/Users/nathan/Documents/Claude/Projects/Atlas Game"
wrangler pages dev public
```

This runs the static site + Functions locally with a real KV namespace mock. Test the `/api/records` endpoint with curl:
```bash
curl 'http://localhost:8788/api/records?token=00000000000000000000000000000001'
curl -X POST 'http://localhost:8788/api/records?token=00000000000000000000000000000001' \
  -H 'Content-Type: application/json' \
  -d '{"hello":"world"}'
```

The token must be 32 hex chars. Anything else returns `400 invalid_token`.

---

## Gotchas (we learned these the hard way)

- **`cd` into the project before running `wrangler pages deploy`.** Wrangler resolves `public` relative to your current directory. Running it from `~` will pick up macOS's `~/Public/` system folder and deploy macOS metadata files (`.localized`, `Drop Box/`) instead of the game. Always `pwd` before deploying.

- **`--branch=main` is mandatory on deploys.** Production branch on the Pages project is set to `main`. Forget the flag and the deploy goes to Preview, which doesn't serve the production URL.

- **Production deployment ≠ deployment exists.** Pages classifies each deploy as Preview or Production at deploy time based on the branch flag. Changing the Production branch setting in the dashboard does NOT retroactively reclassify old deploys — they stay Preview forever. Always check the Environment column in the Deployments tab.

- **Cloudflare's "Nothing is here yet" page** means the project exists but has no Production deployment. Custom domain failures usually trace back to this, not to DNS.

- **DNS for `atlas.nathankolk.com`** is a CNAME at Squarespace pointing to `atlas-game.pages.dev`. The root domain stays on Squarespace nameservers — we did NOT delegate the whole domain to Cloudflare. This is the cleaner setup because Nathan has email records (Resend DKIM, AWS SES MX/SPF) on `nathankolk.com` that would break if nameservers swapped without migration.

- **localStorage is the source of truth.** The sync API mirrors localStorage, it does not replace it. The game must keep working fully offline once loaded, and when `/api/records` is unreachable.

- **Claude's browser-pane preview can't serve straight from `~/Documents`.** macOS privacy protection blocks the spawned `python3` from reading its working directory (`PermissionError` on startup). Copy `public/` into the session scratchpad and serve from there. Running the server yourself in Terminal is unaffected.

- **Direct Upload → Git-connected is a one-way door.** We learned this on 2026-05-23: Cloudflare doesn't let you convert a Direct Upload Pages project to Git-connected in place. The original `atlas-game` Direct Upload project had to be deleted and recreated from GitHub. The KV namespace (`RECORDS_KV`, id `eda12720123441638f8261e2d19efcff`) survived because it lives at the account level, not the project level, and the `wrangler.toml` binding re-attached it on first git-triggered deploy. The Squarespace CNAME for `atlas.nathankolk.com` didn't need to change — same `atlas-game.pages.dev` target since we reused the project name. Downtime was ~3 minutes. Per Cloudflare's docs, going back the other way (Git-connected → Direct Upload) is also blocked.

---

## Things explicitly NOT to do

- **Don't add hint buttons or hover tooltips.** Both were built and removed. User found them unhelpful (and tooltips lingered on mobile).
- **Don't add public/global leaderboards.** Considered and scratched. Daily mode handles the social need without the moderation burden.
- **Don't suggest paid Cloudflare tier without flagging cost.** Workers Paid ($5/mo) is acceptable to discuss for Phase 2 (live mode) but always lead with the price. Phase 1 stays free-tier.
- **Don't regenerate OG image, favicons, or other visual assets** unless asked. They exist (`og-image.png`, `favicon-32.png`, `favicon.png`, `favicon-180.png`) and look the way Nathan wants.
- **Don't break the parchment/sepia/Cormorant Garamond aesthetic.** Visual polish matters to this user. Match palette and typography.
- **Don't push toward Phase 2 (live mode).** Phase 1 is shipped, but Nathan will raise live mode when he's ready. Don't pre-empt.
- **Don't rebuild from scratch.** Always extend the existing HTML file.

---

## How to communicate with this user

- **Explain the *why*, not just the *what*.** Nathan wants to learn the toolchain, not just run commands. First time a tool is introduced, briefly explain its role in the chain. Don't repeat the explanation later.
- **Be direct about tradeoffs.** Frank takes over reassurance. If a feature is overkill, say so. If something will be hard, say so. If a tool costs money, lead with that.
- **Recommend, don't lay out five options.** When there's a clear right answer for his situation, say "I recommend X because Y." He'll push back if he disagrees.
- **Keep responses focused.** He's a builder iterating fast — long preambles slow him down. Lead with the answer or action.
- **One question at a time.** When real design tradeoffs come up, ask a single well-framed multiple-choice question. Don't bundle three ambiguous decisions into one prompt.
- **Build incrementally.** Land one thing cleanly, test it, then stack the next. If he asks for three features, suggest doing one first.

---

## Toolchain installed on this machine

- macOS, login `nathan`. Paths: `/Users/nathan/...`. Project lives at `/Users/nathan/Documents/Claude/Projects/Atlas Game`. (The original setup in April–June 2026 was on a machine with login `nathan.kolk`.)
- Homebrew (`/opt/homebrew`)
- Node + npm via Homebrew
- Wrangler: **not installed** on this machine. Not needed for deploys (GitHub auto-deploy handles that); only for local Functions/KV testing or the manual escape hatch. Install with `npm install -g wrangler`, then `wrangler login`.
- Cloudflare account: yes (also owns Full Stock Amenities project at fullstockamenities.com)
- Git installed (Apple Git via macOS). Repo initialized on `main`, identity set locally to `Nathan Kolk <275984939+nathankolk@users.noreply.github.com>` (no-reply email — `--local` config, doesn't affect other repos).
- GitHub CLI (`gh`) installed via Homebrew, authenticated as `nathankolk` via HTTPS.
- GitHub repo: `https://github.com/nathankolk/atlas-game` (public). `origin/main` tracked.
- Cloudflare Pages project is Git-connected to that repo (as of 2026-05-23). Pushes to `main` auto-deploy to production. Verified end-to-end with a test commit. See Deploying section above.

---

## Quick reference: game internals

For full detail see `atlas_handoff.md`. Highlights:

**Screens and views.** Screens are sibling `.screen` elements (`#menu-screen` is Home, `#explore-screen`, `#stats-screen`, `#settings-screen`, `#game-screen`, `#results-screen`); exactly one has `.active`, and `body[data-screen]` names it. The four views are listed in `VIEWS` (APP SHELL section), which builds the top navigation (desktop) and the tab bar (phones); `#explore`, `#stats`, `#settings` in the address select one, no hash is Home. `switchScreen(name)` is the one way to change screen; `refreshView()` redraws the view on show after its data changed (a sync pull, a reset, another tab's write to a progress store). Moving to another view from the navigation, opening a level's sheet and starting a round from a view each add a browser-history entry (`writeHistory`, state `{ atlas: 'view' | 'sheet' | 'round' }`), so the browser's back button steps inside the app; the app's own close and leave controls step back over that entry (`stepBack()`), and `popstate` is handled in one place (LEVEL LINKS section). Controls outside the game say what they do with `data-action` and are served by one listener (`ACTIONS`, EVENT BINDINGS section), so redrawn markup needs no rewiring. The game and results screens hide the navigation.

**Levels** live in one registry, `LEVELS` (55 entries, 52 playable; grouped by `COLLECTIONS`: World & Continents, United States, Provinces & States, Capitals, Flags, Name It, Pin the City). Home's Library, the level sheet, Stats, Smart Review and level links all read it; nothing else lists levels. An entry has `key` (the `?play=` slug), `arg` (what `startGame()` takes), `mode` (key into `GAME_MODES`), `skill` (mastery skill), `names()` (the items, exactly as the game queues them), `count()`, `learn` (has a Learn ladder), `available`. The lists that come from the world map are worked out once (`listedOnce`). Adding a level to an existing mode is one entry here; a new mode also needs a `GAME_MODES` entry, queue building in `startGame()`, prompt logic in `nextCountry()` and answer handling.

**Home** (HOME section) is drawn in three parts: masthead (greeting, one sentence from real state, three figures), Today (the Daily Five card and the Smart Review card), and the Library (difficulty and map controls, then every collection with all its level cards). A level card always opens the **level sheet** (LEVEL SHEET section: mastery breakdown, Play / Focus Practice / Learn, difficulty with your best for each, map style, Start). Opening a sheet also fetches and builds that level's own map (`prepareLevelMap`), so Start has nothing to wait for.

**Mastery** (per-place learning history): the MASTERY module keeps, for each skill and item, how often it was answered first try, second try or missed, a Leitner box (0–5) and when it is next due (`localStorage["atlas-mastery"]`). Skills: `country`, `country-name`, `capital`, `flag`, `us-state`, `us-capital`, `us-city`, `province:<country>`, `city-pin`. `scoreAnswer(points)` records every resolved question (2 = first try, 1 = second, 0 = missed or skipped); Learn-ladder quizzes do not record items. Answers and finished rounds reach the store only through `recordAnswer()` and `recordRound()`, which also note them for sync (see Sync API). The four steps (new, learning, familiar, mastered) are shown with the moss ramp `--m0`..`--m3`, always next to a count. **Smart Review** (SMART REVIEW section) gathers what is due per skill and plays it as a playlist of practice rounds on a host level (`REVIEW_HOSTS`: the World level of each country skill, States, States → Capitals; cities and provinces on their own levels; Pin the City has none).

**Rounds.** `startGame(arg, opts)` is asynchronous (it awaits the level's map being built); `opts.practice` is a list of names for a practice round, `opts.learn` starts the Learn ladder, `opts.review` carries a Smart Review playlist. The HUD is `setGameChrome()`, `setPrompt()`, `showToast()`, `updateStats()`; `finishGame()` hands one description of the round to `renderResults(r)` (RESULTS section). Any delayed callback during play goes through `roundTimeout()`, which drops it if the round has been left.

**Provinces & States** (`province` game mode, added Sept 2026): click-the-province rounds for Canada (13), China (33), India (36), and Russia (83, split into three rounds of 27–29 along federal-district lines). Rounds are defined in `PROVINCE_ROUNDS`; countries (data URL, results noun) in `PROVINCE_COUNTRIES`. The round key (`'russia-west'`, etc.) is also the records region, so display labels can change without orphaning bests. Display names and Russia's round groups are baked into the data files by `tools/build-provinces.js` — to add a country, add a config entry there, run it (usage is in the file header; it shells out to `npx mapshaper` for topology-aware simplification and fails loudly if a feature count is off), then add entries to the two registries. Border choices: Crimea and Sevastopol are left out of Russia, Taiwan out of China, Hong Kong and Macau in as SARs, India on Natural Earth's de facto lines.

**The map is a globe** (Nov 2026): every mode is drawn on one orthographic globe (drag to turn, north always up, wheel or pinch to zoom). There is no flat map, no SVG, no d3.zoom and no per-country projection any more.
- **Engine**: the `GLOBE ENGINE` section, from its banner to `/* ===== END OF GLOBE ENGINE ===== */`, defines `Globe` (`Globe.create(host, options)`). It knows nothing about the game; its header comment lists the whole API (layers, named styles, view, picking, overlay, imagery). It draws with WebGL and falls back to its own Canvas 2D renderer when WebGL is unavailable (no imagery there). Treat it as a library: change it only for engine bugs, and run `node tools/tests/run.js --globe` when you do.
- **Game side**: the `MAP` section. `const map` holds everything the round has put on the map (marks, tints, outlines, dots, labels, the opening view) as plain data, and the globe is painted from it, so a theme change, a resize or "View on the map" needs nothing restored. One globe lives in `#globe-host` for the whole visit (`initGlobe()`, made straight after Home's first paint; Explore borrows it, see below); `syncMapLayers()` hands it the layers `world`, `us` and `prov`, keyed by `featureKey(f)` (`'name:' + the feature's raw name`). Per round: `applyMapStyle()`, `setupMap()`, `frameMap()`. A mark is a style name (`found`, `second`, `missed`, `good`, `bad`, `reveal`, `prompt`, ...), set with `paintFeature(key)`: never rebuild a layer to recolour a place.
- **Colours** come from the `--g-*` CSS tokens as they stand on the stage; `applyMapLook()` is the one place they reach the engine (theme change, map-style change, imagery status). `--g-land` is the round's own land, `--g-dim` the land around it. Found, second-try and missed marks differ in lightness as well as hue; keep it that way when retuning them.
- **Framing**: the globe's middle is the middle of what the HUD leaves clear (`stageClearArea`, `placeGlobeHost()`: the host overhangs the stage, so host px are not stage px). `roundFrame()` says what a round opens on (curated boxes for continents, or on a stage taller than wide the places in `TALL_FRAMES`; the lower 48 for the US; the level's own features for cities and provinces; the cities' padded box for Pin the City); `bringIntoView()` turns the globe to a place the player needs to see. On a short, wide window (a phone on its side) the prompt card stands at the left and the clear area is what is beside it. On a narrow stage the zoom buttons and the tally sit over the map's lower corners: their boxes are `map.blocked`, the opening frame is shifted and then shrunk until nothing the round asks for is under one (`clearOfCorners()`), and `underHud()` is the test `turnToCountry()`, `bringIntoView()` and `showPinMiss()` use for "in sight".
- **Overlay**: dots, Learn names, pins, reveal rings and outlines are drawn on the engine's 2D overlay in `drawMapOverlay()`, positioned with `globe.project()`. City dots that nearly coincide are drawn 10 px apart (`dotPoints()`), answered ones on top, and a tap goes to the nearest dot still to be found (`dotNear()`).
- **Traps**: call `globe.setLayers` only through `syncMapLayers()`, before `setupMap()` (it resets every layer's styles). `startGame` sets `body[data-screen="game"]` before `frameMap()`, so the globe's canvases are sized once: don't measure the stage before that. Don't give `#globe-host` `pointer-events: auto` (hidden screens are only `opacity: 0`, and it would take Home's clicks). Never call `frameMap()` or `applyMapStyle()` for a round while `explore.on` is true.

**Satellite map & Uncharted**: a switch puts Esri World Imagery on the globe in any mode (`state.mapStyle`, `atlas-map-style`); the third difficulty, Uncharted, forces satellite and hides all borders (`.no-borders` on the stage). `state.difficulty` is `'normal' | 'hard' | 'uncharted'`; `state.hardMode` stays true for both hard and uncharted. The engine lays the tiles over the sphere on the GPU (`globe.setImagery`, see the SATELLITE IMAGERY section); `onImageryStatus()` drives the "Loading imagery…" note and falls back to the chart's look when no tile loads. Keep the Esri credit line visible whenever imagery shows (`.sat-on`). Without WebGL there is no imagery: `imageryAvailable()` is false, Satellite and Uncharted are locked with a note, and a saved Uncharted plays as Hard for that visit.

**Records** live in `localStorage["atlas-records"]` keyed by `gameMode|region|difficulty` (difficulty is `normal`, `hard`, or `uncharted`). Each entry tracks bestScore, bestTime (clean sweeps only), bestAccuracy, gamesPlayed, lastPlayed. **The region is a stored key, not a display label**: continent names, `World`, a province round key. Titles on screen can change; these strings cannot, or returning players lose their bests. The same goes for `atlas-focus`, `atlas-learn`, `atlas-pin` and the mastery item names.

**Focus practice** lives in `localStorage["atlas-focus"]` keyed by `gameMode|region` (no difficulty). Each entry is the missed + second-try names from the last *full* game of that level; practice rounds (`startGame(arg, { practice: names })`, `state.practice`) never rewrite it and skip `commitSessionRecords`, but do record mastery. The level sheet offers Focus Practice when the saved list is non-empty. Replays use `state.startArg`, not `currentContinent`, which is a display label for US modes.

**Learn mode** is a ladder, offered in the level sheet ("Learn Them") for the levels marked `learn: true` in `LEVELS`: the six continents (not The World: 184 names is too long), States, and the province levels. Level n shows the first n names of a shuffled order on the map, then quizzes all n in random order; one miss (or skip) restarts level n, a clean pass adds the next. Lives in the `LEARN MODE` section (`state.learn`, `startLearnLevel()` → `beginLearnQuiz()` → `nextCountry()`; an empty queue calls `learnLevelPassed()` instead of `finishGame()`). Study labels (`placeLearnLabels()`, re-run when a zoom settles) anchor on each place's largest piece at its pole of inaccessibility (the engine's `anchor()`), not its centroid (Puducherry's enclaves average out to inland Tamil Nadu); on a continent, a name whose anchor lies outside the round's frame goes on the part of the country the frame holds (`learnAnchor()`: Russia's name sits on European Russia). A name that doesn't fit inside gets a dot and sits beside it; collisions are resolved greedily, newest first, and older names with no clear spot are left off until zooming in makes room (a "Zoom in to see every name" pill shows). Progress persists in `localStorage["atlas-learn"]` keyed by the level's key (`{ order, level, savedAt }`; `europe`, `us-state`, `china-provinces`); a finished ladder leaves `{ done: true }` there. Practice only: no records, no focus list, no per-item mastery (each cleared level counts as a session).

**Level links**: `?play=<slug>` starts a fresh round of that level on load (`linkedLevel()` reads the link, `openLinkedLevel()` acts on it); `&learn=1` opens a level that has a ladder in Learn mode. A level link puts the globe on screen at once, drawn from the coarse 110m world, while the 50m map loads (`showOpeningGlobe()`). Slugs are the `LEVELS` keys (`north-america`, `world`, `china-provinces`, `us-state`, `west-cities`, `capitals-find-europe`, `pin-asia`), plus `daily`. The address bar tracks the level in play (the round's history entry, or `setAddressBar` where no entry is added; reset on return to a view), and share text links to the level via `levelLink()`. An unknown or unplayable slug lands on Home with a notice and writes nothing.

**Explore** (`EXPLORE` section; the second view, `#explore`): the globe to look around on, with no round in play. It borrows the game's one globe: `enterExplore()` attaches the engine's canvases to `#explore-globe` (`globe.attachTo`) and `leaveExplore()` gives them back to `#globe-host`, so there is never a second WebGL context; `explore.on` says which stage the map code is serving (`mapStage()`), and `startGame` calls `leaveExplore()` before it lays a round out. A tap or the search (`searchCountries()`: `Quiz.fold`, typed aliases, capitals) selects a country and opens its place card (`renderPlace()`; a side column on wide screens, a bottom sheet on phones, with `--place-h` and `.has-sheet` telling the stylesheet about the sheet): flag, capital, the countries it borders, and the player's mastery in four skills (`EXPLORE_SKILLS`). Neighbours come from the world map's topology (`worldNeighbours()`, `topojson.neighbors`), checked by hand against all 184 countries; `EXTRA_BORDERS` adds the two real borders the 50m shapes are too coarse to draw, and `BORDER_ONLY` names the five microstates that are on the map but not in the atlas. "Colour by" paints mastery in the moss ramp (engine styles `step0`–`step3`) with a counted legend; Stats links to it ("See it on the globe"). `#explore=<slug>` selects a country (`Quiz.slug` of its name). Uncharted does not apply here: Explore follows the map style only. Keys: `/` search, Escape closes the card, and the globe's own keys (`globeKey()`: arrows, `+`, `-`, `0`), which work in a round too.

**Pin the City** (`city-pin` mode, `PIN THE CITY` sections): a MapTap-style drill. Blank globe (borders, no names; Hard hides borders, Uncharted is satellite with no borders), a city name, tap anywhere on the globe to aim, Drop Pin to score: 100 within 25 km, then `100·e^(−(km−25)/400)` (`pinPoints`). `PIN_CITIES` holds 20 cities per continent as `[name, country, lat, lon]` (coordinates checked against Natural Earth borders); a round is all 20 of a continent, or 20 drawn from all 120 for World. Card keys/slugs live in `PIN_ROUNDS` (`pin-europe`, ...). Continent rounds open on the cities' padded bounding box (`pinFitGeometry`), not the continent's land, so Europe isn't shrunk by Siberia. After a drop the globe turns so the city, and the pin when one view can hold both, are in sight (`showPinMiss`). History lives in its own store, `localStorage["atlas-pin"]` (`{ games: [{ at, region, diff, score, max, avgKm }], cities: { name: [[at, km], ...last 5] } }`), synced as `pin` with union merges — not in atlas-records, whose score/accuracy model doesn't fit points-by-distance.

**Capitals, Flags, Name It** (country quizzes, Nov 2026): four more game modes over the same countries, each with a level for The World and one per continent. `capital-pick` (the globe turns to a country, pick its capital from four), `capital-find` (a capital is named, tap its country), `flag` (a flag is shown, tap its country) and `name-it` (the globe turns to a country, type its name). `QUIZ_KINDS` holds what differs per mode (slug prefix, collection, mastery skill, which countries it asks about) and `QUIZ_ROUNDS` maps a level key (`capitals-europe`, `capitals-find-europe`, `flags-europe`, `name-europe`, `…-world`) to `{ mode, region }`; the region (`Europe`, `World`) is the records region. The Capitals collection holds fourteen levels and shows seven: its header switch (`variants` on the collection, `variant` on a level, saved per device in `atlas-capitals-way`) picks the set.
- **Data and logic**: `WORLD_FACTS` and `COUNTRY_TYPED_ALIASES` (the WORLD FACTS section: capital, ISO code, other accepted capitals; typed spellings) and the `Quiz` module (the QUIZ LOGIC section) have their own tests in `tools/tests/`. Change them in the page, then run those tests. `Quiz` does the typed-answer matching (exact, alias, forgiven misspelling, "a real country but outside this level"), the four capital choices, flag emoji and which flags can be asked.
- **Flags** are drawn from a self-hosted font, `public/vendor/TwemojiCountryFlags.woff2` (`'Atlas Flags'`, credited in Settings → About), fetched the first time a flag is about to show. `flagsReady()` asks `Quiz.flagSupport`; where no flag can be drawn the flag levels turn unavailable (`state.flagsOff`). Somaliland, Northern Cyprus and Syria have no usable glyph and are not asked.
- **Name It**: the field lives in the prompt card (`#answer-form`). A complete, exact name is taken as it is typed; anything else waits for Enter, and so does a short form that begins a longer spelling of its own country ("Bosnia", "US": the matcher's `short`). Keys that run on past a name taken as typed are dropped until the typing pauses, so they do not land in the next question. A wrong country costs a try; text that is no country costs nothing. No autocomplete, no suggestions — that would be a hint. Every letter key belongs to the field there, so Escape is the key that skips. `followKeyboard()` keeps the game screen to the visual viewport, so a phone's keyboard never covers the country being asked about.
- **Shown countries**: `setPromptFeature()` tints and outlines the country a question is about (also in Uncharted, where it is the one shape on the map) and `turnToCountry()` turns the globe to it. `MODE_DIFFICULTY_DESCS` says what the difficulties mean where that differs from the general rule.
- **Mastery**: skills `capital` (both capitals modes), `flag` and `country-name`, item = the country. Smart Review plays them on the World level of each.

**Daily Five** is deterministic: date string → FNV-1a hash → Mulberry32 PRNG → 5 countries with a difficulty ramp (Tier 1 easy → Tier 3 hard, hand-curated tier lists in the source). Daily epoch is `2026-04-26` = Day 1. Attempts live in `localStorage["atlas-daily-attempts"]`, trimmed to last 30 days. Don't touch its PRNG, epoch or tier lists: the puzzle is the same for everyone.

**Stats and Settings**: `renderStats()` (STATS section) draws everything from the stores as they stand, with every value printed (no hover layer): headline figures, mastery by collection and level, a 12-week calendar, places that need work, Daily Five, Pin the City, personal records. `renderSettings()` (SETTINGS section): theme (Parchment / Night Chart / Match system, `atlas-theme`), Reduce motion (`atlas-motion`; when unset the OS setting decides), default difficulty and map style, Sync, Data (export as JSON, reset behind a confirm dialog), About. The one modal is `openDialog()` (DIALOG section); there is no native alert, confirm or prompt.

**Accessibility conventions**: every control has a name (`aria-label` where there is no text) and a visible focus ring (`--focus`, drawn in `--focus-color`, which stands 3:1 off every surface in both themes); the sheet and the dialog trap focus and return it; Escape closes them, leaves the results, and leaves a round (in Name It it skips). The question (`#prompt`, a live region) and the answer toast (`#toast`, a status) are announced; the results summary takes the focus as the screen comes up. Reduce motion (the Settings switch or the OS setting, `reducedMotion()`) makes globe flights instant, stops the glide after a drag (`applyMapMotion()` passes it to the engine) and stills the reveal rings; the stylesheet cuts transitions. Colour is never the only signal: outcomes carry an icon or a label, mastery a count.

**Loading**: the 50m world is preloaded from the `<head>` (`<link rel="preload">`) and Home is drawn as soon as it is in; nothing else is fetched until it is needed (the coarse world for a level link, the US or a province file when that level's sheet opens, the flag font when a flag is about to show, imagery tiles when Satellite is on). Don't add work to `renderHome()` that grows with the number of countries squared, and don't add startup fetches.

**Sync API** (`functions/api/records.js`):
- `GET /api/records?token=<32 hex>` → returns stored JSON blob, or `"null"`
- `POST /api/records?token=<32 hex>` → overwrites blob, returns `{ ok: true }`
- Token IS the credential. No accounts, no passwords. Same model as Signal device linking.
- 256 KB body limit (`payload_too_large`, 413, shown in Settings' sync status). The payload is `progressSnapshot()`: records, daily attempts, focus lists, the pin store, Learn ladders, the mastery store and `resetAt`. A heavy player's is about 120 KB; the most the stores can hold is about 157 KB.
- When it runs: on load and when the page comes back into view, pull and merge, then push if an earlier push never got through (`unsent` in `atlas-sync-meta`; its error stays on show in Settings until it does). At the end of every round and on "Sync now": pull, merge, push.
- `resetAt` (`localStorage["atlas-reset-at"]`) makes Reset progress survive sync: a pull that carries a newer reset erases what this device holds from before that moment and keeps what it has played since (`eraseProgressBefore()`): dated stores by their own times, records and mastery by playing back `atlas-sync-notes`, a device-local list of each answer and finished round since the last merging pull (not a progress store; never synced; gone when sync is unlinked). A blob older than this device's reset is not merged and is overwritten by the next push.
- Tallies merge by the larger figure, not by adding (`gamesPlayed`, the mastery day rows): they add up when devices take turns, and play on two devices at once is counted once where it overlaps.

**Test hook**: `window.__atlas` (end of the script) exposes `state`, `mastery`, `LEVELS`, `COLLECTIONS`, `VIEWS`, `startGame`, `levelByKey`, `showView`, `map`, `globe`, `explore` and a few more for checks driven from a browser console or Playwright. It is read-mostly; the game never reads it.

---

## When in doubt

Ask Nathan. He prefers one well-framed question over watching you guess wrong and waste a cycle.
