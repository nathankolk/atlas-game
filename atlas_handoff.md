# Cartographer's Atlas — Project Reference

**Owner:** Nathan Kolk
**Last updated:** May 22, 2026
**Live at:** `https://atlas.nathankolk.com` (also `https://atlas-game.pages.dev`)

This doc is the deeper reference for the game: full feature catalog, design decisions, technical schemas, and tabled ideas. For everyday working context (deploy commands, conventions, gotchas), see `CLAUDE.md` — it's the orientation doc and loads automatically in Claude Code.

---

## What this project is

A geography quiz web app with a parchment-and-compass aesthetic, built as a single HTML file. Players test their knowledge of world countries, US states, and US state capitals through several quiz modes, with persistent records, share-friendly results, and a daily challenge à la Wordle.

The whole game lives in **one HTML file** (`public/index.html`) with embedded CSS and JavaScript — no build step, no frameworks, no dependencies beyond CDN-loaded libraries:

- **D3.js v7.8.5** (cdnjs) — map projections, zoom, path rendering
- **topojson v3.0.2** (cdnjs with jsdelivr/unpkg fallbacks) — TopoJSON to GeoJSON conversion
- **world-atlas v2** (jsdelivr/unpkg) — countries-50m.json (with 110m fallback)
- **us-atlas v3** (jsdelivr/unpkg) — states-10m.json (lazy-loaded only when a US mode is selected)

---

## Features built so far

### Visual identity
- Parchment background with paper-grain SVG noise overlay and vignette
- Cormorant Garamond + Crimson Pro typography (Google Fonts)
- Hand-drawn compass rose SVG (animated rotation on menu)
- Gold/sepia/navy/moss palette via CSS custom properties
- Open Graph image (1200×630), favicons (32, 180, 512), `theme-color` meta
- Responsive — works phone to desktop

### Game modes
1. **The Whole World** — all ~170 sovereign countries, Natural Earth projection
2. **By Continent** — Africa, Asia, Europe, North America (23 sovereign countries — Caribbean nations included), South America, Oceania. Each uses Mercator projection rotated to the continent's centroid so it's centered properly.
3. **The Fifty States** — US states only, Albers USA projection (Alaska + Hawaii inset)
4. **US Capitals → States** — capital name shown, click the matching state on the map
5. **US States → Capitals** — state name shown + state highlighted on map, pick the matching capital from 4 multiple-choice buttons
6. **Daily Five** — Wordle-style shared puzzle (see "Daily mode" section below)

### Core mechanics
- **Click-to-find** — country prompt at top, click matching country on map
- **Two-tries scoring** — 2 pts first try, 1 pt second try, 0 if missed twice
- **Skip button** — counts as missed (0 pts)
- **Persistent green/red marking** of correct/missed countries throughout a round
- **Hard Mode toggle** — countries don't stay green/red after answering, preventing process-of-elimination
- **Prominent reveal animation** when a country is missed — gold flash with pulsing concentric rings at the centroid, plus auto-pan if the country is off-screen at high zoom
- **Zoom & pan** — wheel/pinch zoom up to 20×, click-drag pan, on-map +/-/reset buttons, keyboard shortcuts (`+`, `-`, `0`, `s` for skip, `Esc` to menu)
- **Vector-effect non-scaling-stroke** keeps borders crisp at any zoom level
- **50m TopoJSON detail** for crisper coastlines than the default 110m

### Hierarchical menu structure
```
Main menu
├── Daily Five (top, navy + gold card)
├── The Whole World (featured card)
├── By Continent (folder card → opens sub-view with 6 continent cards)
└── The United States (folder card → opens sub-view with 3 mode cards)
```
Sub-views collapse the top header to ~60% to give cards more room.

### Personal records (localStorage)
Stored under key `atlas-records`. Tracks per **region × game mode × difficulty (normal/hard)**:
- **Best Score** — highest points earned
- **Best Time** — fastest completion (only counted for clean sweeps where all countries were found)
- **Best Accuracy** — highest percent correct
- **Games Played** + **Last Played**

Records are surfaced on:
- Menu cards (small "★ Best: X/Y" line)
- Folder cards (aggregate "Best: continent X%")
- Results screen (full panel; broken records glow gold)
- Share text (🏆 record-broken line for new records)

### Share results
- Native share sheet on mobile (iOS/Android)
- Clipboard fallback on desktop with "✓ Copied to clipboard" confirmation
- `window.prompt` last-resort fallback
- Three-color emoji grid: 🟩 first try, 🟨 second try, 🟥 missed
- Daily mode uses a **spoiler-safe** compact format (no country names)

### Daily Five mode (the social hook)
- **Deterministic puzzle generation** — date string hashed with FNV-1a, fed to Mulberry32 PRNG. Same UTC date produces the same 5 countries for every player worldwide.
- **Difficulty ramp** — Slot 1: Tier 1 (easy/famous). Slot 5: Tier 3 (hard/obscure). Slots 2–4 ramp through Tier 2.
- **Country tiers** are hand-curated:
  - Tier 1 EASY (~45 countries): USA, Brazil, China, France, Egypt, etc.
  - Tier 3 HARD (~45 countries): Bhutan, Comoros, Suriname, Eritrea, etc.
  - Tier 2 MEDIUM: everything else, computed at runtime
- **Once-per-day enforcement** via `atlas-daily-attempts` localStorage key, with the date as primary key. Caveat: trivially bypassable by clearing storage — same as Wordle. Doesn't matter for casual play.
- **Locked-out card** after playing — shows your emoji grid, score, share button, practice replay button, and live HH:MM:SS countdown to next puzzle (midnight UTC).
- **Streak counter** — consecutive days played, shown as 🔥 N day streak.
- **Practice replay** — re-plays today's exact 5 countries without affecting record.
- **Share format:**
  ```
  🧭 Atlas Daily #57
  4/5 found · 7/10 pts

  🟩🟨🟩🟥🟨

  https://atlas.nathankolk.com
  ```
- **Daily epoch:** `2026-04-26` is Day 1 (so the puzzle number `Daily #N` is meaningful).

---

## Recent removals (don't re-add without asking)

- **Hint button** — removed entirely, including state.hintUsed, the function, the H key shortcut, and the prompt-area hint-text element. User found it unhelpful.
- **Hover tooltip (the question mark)** — removed entirely, including the tooltip element, CSS, and three hover handlers. Sometimes lingered on mobile.

---

## Phase 1: Cross-device record sync

User wants personal records to sync across phone and laptop. **Group leaderboards were considered and explicitly scratched** — for a knowledge quiz, daily mode provides enough social hook on its own without the moderation burden.

### Architecture
- **Frontend:** stays as the existing single-file HTML game (with new JS for sync calls).
- **Backend:** Cloudflare Pages Function exposing `GET /api/records?token=...` and `POST /api/records?token=...`.
- **Storage:** Cloudflare KV namespace (`RECORDS_KV`), one row per user (key = secret token, value = JSON records blob).
- **Auth model:** No passwords. Each user creates a username locally; the app generates a 128-bit random secret token stored in localStorage. To link a second device, user views a 12-character sync code on device 1 and types it on device 2. Same model as Signal device linking.
- **localStorage stays the source of truth.** The API mirrors it — the game still works fully offline.

### Status
- **Backend Function:** done, deployed at `functions/api/records.js`
- **KV namespace:** provisioned (`eda12720123441638f8261e2d19efcff`), bound via `wrangler.toml`
- **Cloudflare Pages migration:** done. Live at `atlas.nathankolk.com` and `atlas-game.pages.dev`
- **Client-side sync UI:** not yet built. Needs username creation flow, token generation, sync-code device-linking, periodic POST on record changes, GET-on-load merge logic.

---

## Tabled future ideas (don't build without checking)

- **Live Kahoot-style mode** — multiplayer rooms with WebSockets via Cloudflare Durable Objects. Requires Workers Paid plan ($5/mo minimum). User explicitly wanted this in Phase 2 after Phase 1 ships.
- **Daily archive** — let players catch up on yesterday's puzzle if they missed it (with "Catch-up" badge so it doesn't count for streak).
- **Hand-curated daily puzzles** — once the sync layer exists, hand-pick puzzles for themed days (holidays, etc.) instead of pure random tier shuffle.
- **GitHub auto-deploy** — connect repo to Cloudflare Pages for push-to-deploy. Removes the manual `wrangler pages deploy` step and the wrong-directory class of bugs. Recommended next infrastructure step.

---

## Technical reference

### Game state structure (selected fields)
```javascript
state = {
  // World dataset
  allFeatures, canonicalByFeature, continentByFeature, featureByCanonical,
  // US dataset (lazy-loaded)
  usFeatures, usCanonicalByFeature, usFeatureByCanonical, usLoaded, usLoading,
  // Active game
  activeDataset, gameMode, currentContinent,
  eligibleFeatures, queue, current, currentPromptText,
  attempts, correct, wrong, score, missed, sequence,
  // Daily-specific
  dailyDateKey, dailyReplay,
  // Settings
  hardMode, menuView,
  // Map rendering
  svg, projection, pathGen, mapG, zoomBehavior, currentTransform
}
```

### Game modes registry
Located at `GAME_MODES = { ... }` in the JS. Adding a new mode means:
1. Adding an entry there with `dataset` and `label()` function
2. Adding handling in `startGame()` for queue building
3. Adding any custom prompt logic in `nextCountry()`
4. Adding a card in `renderMainMenu()` / sub-menu

### Records storage shape
```javascript
localStorage["atlas-records"] = {
  "world-country|North America|normal": {
    bestScore: { value, max, date },
    bestTime: { value, total, date },     // only for clean sweeps
    bestAccuracy: { correct, total, pct, date },
    gamesPlayed,
    lastPlayed
  },
  "us-state|The United States|hard": { ... },
  "daily-five|Daily|normal": { ... },
  ...
}
```
Key format: `gameMode|region|difficulty`

### Daily attempts shape
```javascript
localStorage["atlas-daily-attempts"] = {
  "2026-04-28": {
    dateKey, puzzleNumber, countries,
    sequence, score, correct, wrong, total,
    timeSeconds, hardMode, completedAt
  },
  ...
}
```
Trimmed to last 30 days.

### Sync API shape (`functions/api/records.js`)
- **`GET /api/records?token=<32 hex>`** — returns the stored JSON blob for that token, or the literal string `null` if none exists.
- **`POST /api/records?token=<32 hex>`** — overwrites the blob with the request body (must be valid JSON). Returns `{ ok: true }`.
- **Token format:** 32 hex chars (128 bits). Anything else returns `400 invalid_token`.
- **Body limit:** 64 KB. Records blobs are well under this in practice.
- **Trust model:** the token IS the credential. No accounts, no passwords. Anyone with the token can read or overwrite that user's records. Same risk model as Signal device-linking codes.

---

## Project history (the short version)

- **Phase 0:** Single-file HTML game built and iterated locally. Hosted on tiiny.site for casual sharing.
- **Apr 26, 2026:** Daily Five launched (Day 1 of the daily epoch).
- **Apr 28, 2026:** Decision to migrate to Cloudflare Pages so a Worker backend could support cross-device sync. Group leaderboards considered and scratched.
- **May 22, 2026:** Migration complete. Site live on Cloudflare Pages at `atlas-game.pages.dev`. Custom subdomain `atlas.nathankolk.com` wired up via CNAME at Squarespace DNS (nameservers stayed at Squarespace to preserve email records on the root domain). Phase 1 backend deployed; client-side sync UI is the next milestone.
